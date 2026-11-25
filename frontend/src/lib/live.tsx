/**
 * Real-time updates over the backend WebSocket (/api/v1/ws/live).
 *
 * Events are emitted by real backend actions only (a review finishing analysis,
 * an alert being created, inventory changing). This provider turns them into
 * cache invalidations — so pages refetch and update on their own — plus toasts.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { API_BASE_URL, api, tokenStorage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";

export type LiveStatus = "connecting" | "live" | "offline";
const LiveContext = createContext<LiveStatus>("offline");

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveStatus() {
  return useContext(LiveContext);
}

interface WsMessage { type: string; payload: Record<string, unknown> }

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<LiveStatus>("offline");
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setStatus("offline");
      return;
    }
    let ws: WebSocket | null = null;
    let stopped = false;
    let retries = 0;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;

    function handle(msg: WsMessage) {
      const p = msg.payload;
      const pid = (p.product_id as string | undefined) ?? undefined;
      switch (msg.type) {
        case "review_analyzed": {
          qc.invalidateQueries({ queryKey: ["reviews", pid] });
          qc.invalidateQueries({ queryKey: ["product", pid] });
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["sentiment-summary", pid] });
          qc.invalidateQueries({ queryKey: ["ml-price-recommendation", pid] });
          qc.invalidateQueries({ queryKey: ["analytics"] });
          qc.invalidateQueries({ queryKey: ["admin-stats"] });
          const label = String(p.sentiment_label ?? "").toLowerCase();
          const score = typeof p.sentiment_score === "number" ? ` (${Math.round(p.sentiment_score * 100)}%)` : "";
          toast({
            kind: label === "negative" ? "warning" : "success",
            title: "Review analyzed",
            message: `Sentiment: ${label}${score}${p.emotion_label ? ` · emotion: ${p.emotion_label}` : ""}`,
          });
          break;
        }
        case "review_analysis_failed":
          qc.invalidateQueries({ queryKey: ["reviews"] });
          qc.invalidateQueries({ queryKey: ["admin-stats"] });
          break;
        case "alert_created":
          qc.invalidateQueries({ queryKey: ["alerts"] });
          qc.invalidateQueries({ queryKey: ["admin-stats"] });
          toast({
            kind: p.severity === "critical" ? "error" : "warning",
            title: `New alert: ${String(p.alert_type ?? "").replace(/_/g, " ")}`,
            message: String(p.message ?? ""),
            duration: 7000,
          });
          break;
        case "inventory_updated":
          qc.invalidateQueries({ queryKey: ["inventory", pid] });
          qc.invalidateQueries({ queryKey: ["ml-price-recommendation", pid] });
          break;
      }
    }

    function connect() {
      const token = tokenStorage.getAccessToken();
      if (!token || stopped) return;
      setStatus("connecting");
      ws = new WebSocket(`${API_BASE_URL.replace(/^http/, "ws")}/api/v1/ws/live?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        retries = 0;
        setStatus("live");
        pingTimer = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25000);
      };
      ws.onmessage = (ev) => {
        try {
          handle(JSON.parse(ev.data) as WsMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        window.clearInterval(pingTimer);
        setStatus("offline");
        if (stopped) return;
        retries += 1;
        retryTimer = window.setTimeout(async () => {
          // A cheap authenticated call refreshes an expired access token before we reconnect.
          try { await api.get("/auth/me"); } catch { /* interceptor handles expiry */ }
          connect();
        }, Math.min(1000 * 2 ** retries, 15000));
      };
    }

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      ws?.close();
    };
  }, [userId, qc, toast]);

  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}
