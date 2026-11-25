import type { Role } from "@/types/auth";

export interface RoleMeta {
  label: string;
  description: string;
  /** pill colours on a light background */
  light: string;
  /** pill colours on the dark header */
  dark: string;
  /** solid accent used for cards / avatars */
  accent: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  ADMIN: {
    label: "Admin",
    description: "Manage users, products, images and view system analytics.",
    light: "bg-purple-100 text-purple-800 border-purple-300",
    dark: "bg-purple-500/25 text-purple-200 border-purple-400/50",
    accent: "#7c3aed",
  },
  ANALYST: {
    label: "Analyst",
    description: "Sentiment analytics, demand forecasting, dynamic pricing and model performance.",
    light: "bg-blue-100 text-blue-800 border-blue-300",
    dark: "bg-blue-500/25 text-blue-200 border-blue-400/50",
    accent: "#2563eb",
  },
  BUSINESS_USER: {
    label: "Business User",
    description: "Products, reviews, sentiment insights, demand forecasts and the AI Copilot.",
    light: "bg-emerald-100 text-emerald-800 border-emerald-300",
    dark: "bg-emerald-500/25 text-emerald-200 border-emerald-400/50",
    accent: "#059669",
  },
};

export interface NavItem {
  to: string;
  label: string;
  roles?: Role[]; // omitted = every role
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Products" },
  { to: "/copilot", label: "AI Copilot" },
  { to: "/alerts", label: "Alerts" },
  { to: "/analytics", label: "Analytics", roles: ["ADMIN", "ANALYST"] },
  { to: "/admin", label: "Admin Console", roles: ["ADMIN"] },
  { to: "/products/new", label: "Add Product", roles: ["ADMIN"] },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(role));
}

export function roleLabel(role: Role): string {
  return ROLE_META[role].label;
}
