import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastKind = "success" | "error" | "info" | "warning";
interface ToastItem { id: number; kind: ToastKind; title: string; message?: string }
interface ToastOptions { kind?: ToastKind; title: string; message?: string; dedupeKey?: string; duration?: number }

const ToastContext = createContext<((o: ToastOptions) => void) | undefined>(undefined);

const STYLE: Record<ToastKind, { bar: string; icon: ReactNode }> = {
  success: { bar: "border-l-amz-green", icon: <CheckCircle2 size={18} className="text-amz-green" /> },
  error: { bar: "border-l-amz-red", icon: <XCircle size={18} className="text-amz-red" /> },
  warning: { bar: "border-l-amz-orange", icon: <AlertTriangle size={18} className="text-amz-orange" /> },
  info: { bar: "border-l-amz-link", icon: <Info size={18} className="text-amz-link" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const recent = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    ({ kind = "info", title, message, dedupeKey, duration = 5000 }: ToastOptions) => {
      // React StrictMode runs effects twice in dev; dedupe identical toasts fired within 1.5s.
      const key = dedupeKey ?? `${kind}|${title}|${message ?? ""}`;
      const now = Date.now();
      if (now - (recent.current.get(key) ?? 0) < 1500) return;
      recent.current.set(key, now);

      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { id, kind, title, message }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-[100] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={`pointer-events-auto flex gap-3 rounded-md border border-amz-border border-l-4 bg-white p-3 shadow-lg ${STYLE[t.kind].bar}`}
              role="status"
            >
              <div className="mt-0.5">{STYLE[t.kind].icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#0f1111]">{t.title}</p>
                {t.message && <p className="mt-0.5 text-[13px] text-amz-muted">{t.message}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="self-start text-amz-muted hover:text-black" aria-label="Dismiss">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
