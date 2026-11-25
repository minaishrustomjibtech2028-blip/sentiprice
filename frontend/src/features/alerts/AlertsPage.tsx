import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCheck, PackageX, ShieldAlert, ThumbsDown } from "lucide-react";

import { api } from "@/lib/api";
import type { Alert, Product } from "@/types/product";

async function fetchAlerts(unreadOnly: boolean): Promise<Alert[]> {
  const { data } = await api.get<Alert[]>(`/alerts${unreadOnly ? "?unread_only=true" : ""}`);
  return data;
}
async function fetchProducts(): Promise<Product[]> {
  const { data } = await api.get<Product[]>("/products");
  return data;
}

const TYPE_META: Record<string, { icon: typeof Bell; label: string }> = {
  low_stock: { icon: PackageX, label: "Low stock" },
  negative_review: { icon: ThumbsDown, label: "Negative review" },
  suspicious_review: { icon: ShieldAlert, label: "Suspicious review" },
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-amz-red",
  warning: "border-amber-300 bg-amber-50 text-amber-700",
  info: "border-blue-300 bg-blue-50 text-amz-link",
};

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data: alerts, isLoading } = useQuery({ queryKey: ["alerts", unreadOnly], queryFn: () => fetchAlerts(unreadOnly) });
  const { data: products } = useQuery({ queryKey: ["products", null, ""], queryFn: fetchProducts });
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/alerts/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.post("/alerts/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Bell size={20} /> Alerts</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-amz-muted">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          <button onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} className="btn btn-light text-xs">
            <CheckCheck size={14} /> Mark all read
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-amz-muted">Loading…</p>}
      {alerts && alerts.length === 0 && (
        <div className="card p-10 text-center">
          <CheckCheck size={28} className="mx-auto mb-2 text-amz-green" />
          <p className="font-semibold">You're all caught up</p>
          <p className="mt-1 text-sm text-amz-muted">No {unreadOnly ? "unread " : ""}alerts right now.</p>
        </div>
      )}

      <div className="space-y-2">
        {alerts?.map((a) => {
          const meta = TYPE_META[a.alert_type] ?? { icon: AlertTriangle, label: a.alert_type.replace(/_/g, " ") };
          const Icon = meta.icon;
          const product = productMap.get(a.product_id);
          return (
            <div key={a.id} className={`card flex items-start gap-3 p-4 ${a.is_read ? "opacity-70" : ""}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">{meta.label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info}`}>{a.severity}</span>
                  {!a.is_read && <span className="h-2 w-2 rounded-full bg-amz-orange" />}
                </div>
                <p className="mt-0.5 text-sm text-[#0f1111]">{a.message}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-amz-muted">
                  {product && <Link to={`/products/${product.id}`} className="amz-link">{product.name}</Link>}
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                </div>
              </div>
              {!a.is_read && (
                <button onClick={() => markRead.mutate(a.id)} className="btn btn-light shrink-0 text-xs">Mark read</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
