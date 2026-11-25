import type { Role, User } from "@/types/auth";

export interface UserAdminUpdate {
  role?: Role;
  is_active?: boolean;
}

export interface ModelInfo {
  key: string;
  name: string;
  kind: string;
  status: "ready" | "missing" | "loads_on_first_use";
  detail: string;
  metrics: Record<string, number | null>;
  note?: string | null;
}

export interface AdminStats {
  users_total: number;
  users_active: number;
  users_by_role: Record<Role, number>;
  products_total: number;
  products_with_image: number;
  reviews_total: number;
  reviews_analyzed: number;
  reviews_failed: number;
  alerts_unread: number;
  websocket_connections: number;
  models: ModelInfo[];
}

export type AdminUser = User;
