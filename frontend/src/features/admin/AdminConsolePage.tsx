import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, Boxes, Cpu, Image as ImageIcon, ShieldCheck,
  Star, Users as UsersIcon, Wifi,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { ROLE_META } from "@/lib/roles";
import type { AdminStats, UserAdminUpdate } from "@/types/admin";
import type { Role, User } from "@/types/auth";

async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>("/admin/users");
  return data;
}
async function fetchStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>("/admin/stats");
  return data;
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof UsersIcon; label: string; value: string | number; accent: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: `${accent}1a`, color: accent }}>
        <Icon size={18} />
      </span>
      <div>
        <p className="text-xl font-bold leading-tight">{value}</p>
        <p className="text-xs text-amz-muted">{label}</p>
      </div>
    </div>
  );
}

const MODEL_STATUS_STYLE: Record<string, string> = {
  ready: "bg-emerald-50 text-emerald-700 border-emerald-300",
  loads_on_first_use: "bg-blue-50 text-amz-link border-blue-300",
  missing: "bg-amber-50 text-amber-700 border-amber-300",
};
const MODEL_STATUS_LABEL: Record<string, string> = {
  ready: "Ready", loads_on_first_use: "Loads on first use", missing: "Not trained yet",
};

export default function AdminConsolePage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: fetchStats, refetchInterval: 15000 });
  const { data: users, isLoading: usersLoading } = useQuery({ queryKey: ["admin-users"], queryFn: fetchUsers });

  const updateUser = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UserAdminUpdate }) => {
      const { data } = await api.patch<User>(`/admin/users/${id}`, payload);
      return data;
    },
    onMutate: ({ id }) => setBusyUserId(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ kind: "success", title: "User updated", message: `${updated.full_name} is now ${ROLE_META[updated.role].label}${updated.is_active ? "" : " (deactivated)"}.` });
    },
    onError: (err) => {
      const message = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Could not update user.";
      toast({ kind: "error", title: "Update failed", message });
    },
    onSettled: () => setBusyUserId(null),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck size={22} className="text-purple-600" />
        <h1 className="text-xl font-bold">Admin console</h1>
      </div>

      {/* System stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={UsersIcon} label="Active users" value={stats ? `${stats.users_active}/${stats.users_total}` : "—"} accent="#7c3aed" />
        <StatCard icon={Boxes} label="Products" value={stats?.products_total ?? "—"} accent="#2563eb" />
        <StatCard icon={ImageIcon} label="With photo" value={stats?.products_with_image ?? "—"} accent="#0891b2" />
        <StatCard icon={Star} label="Reviews analyzed" value={stats ? `${stats.reviews_analyzed}/${stats.reviews_total}` : "—"} accent="#059669" />
        <StatCard icon={AlertTriangle} label="Unread alerts" value={stats?.alerts_unread ?? "—"} accent="#d97706" />
        <StatCard icon={Wifi} label="Live connections" value={stats?.websocket_connections ?? "—"} accent="#db2777" />
      </div>

      {/* Users by role */}
      {stats && (
        <div className="card mt-5 p-4">
          <p className="mb-3 text-sm font-bold">Users by role</p>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(stats.users_by_role) as Role[]).map((role) => (
              <span key={role} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${ROLE_META[role].light}`}>
                {ROLE_META[role].label}: {stats.users_by_role[role]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* User management */}
      <div className="card mt-5 overflow-x-auto p-4">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-bold"><UsersIcon size={15} /> User management</p>
        {usersLoading && <p className="text-sm text-amz-muted">Loading users…</p>}
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-amz-border text-xs uppercase text-amz-muted">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Joined</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => {
              const isSelf = u.id === me?.id;
              const busy = busyUserId === u.id && updateUser.isPending;
              return (
                <tr key={u.id} className="border-b border-amz-border last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{u.full_name}{isSelf && <span className="ml-1.5 text-xs text-amz-muted">(you)</span>}</td>
                  <td className="py-2.5 pr-3 text-amz-muted">{u.email}</td>
                  <td className="py-2.5 pr-3">
                    <select
                      value={u.role}
                      disabled={isSelf || busy}
                      onChange={(e) => updateUser.mutate({ id: u.id, payload: { role: e.target.value as Role } })}
                      className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-60 ${ROLE_META[u.role].light}`}
                    >
                      {(["ADMIN", "ANALYST", "BUSINESS_USER"] as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_META[r].label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-amz-soft text-amz-muted"}`}>
                      {u.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-amz-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <button
                      disabled={isSelf || busy}
                      onClick={() => updateUser.mutate({ id: u.id, payload: { is_active: !u.is_active } })}
                      className={`btn ${u.is_active ? "btn-danger" : "btn-light"} px-2.5 py-1 text-xs`}
                      title={isSelf ? "You cannot deactivate your own account" : undefined}
                    >
                      {u.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Model status */}
      {stats && (
        <div className="card mt-5 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold"><Cpu size={15} /> ML model status</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stats.models.map((m) => (
              <div key={m.key} className="rounded-md border border-amz-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{m.name}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${MODEL_STATUS_STYLE[m.status]}`}>
                    {MODEL_STATUS_LABEL[m.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-amz-muted">{m.kind}</p>
                {Object.values(m.metrics).some((v) => v !== null && v !== undefined) && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {Object.entries(m.metrics).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => (
                      <span key={k}><span className="text-amz-muted">{k.replace(/_/g, " ")}:</span> {v}</span>
                    ))}
                  </div>
                )}
                {m.note && <p className="mt-2 text-[11px] italic text-amz-muted">{m.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-5 flex items-start gap-2 p-4 text-xs text-amz-muted">
        <Activity size={16} className="mt-0.5 shrink-0" />
        This console reads live data — no counts are hardcoded. Review and demand figures update automatically as
        the WebSocket pushes new analysis results.
      </div>
    </div>
  );
}
