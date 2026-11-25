import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, ChevronRight, LineChart, MessageSquareText, ShieldCheck, Sparkles, Tag, TrendingUp, Users,
} from "lucide-react";

import { formatINR } from "@/lib/money";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_META } from "@/lib/roles";
import { categoryIcon } from "@/lib/categoryIcons";
import { ProductImage } from "@/components/ProductImage";
import type { Product } from "@/types/product";

async function fetchCategories(): Promise<string[]> {
  const { data } = await api.get<string[]>("/products/categories");
  return data;
}
async function fetchProducts(): Promise<Product[]> {
  const { data } = await api.get<Product[]>("/products");
  return data;
}

const ROLE_FEATURES: Record<string, { to: string; icon: typeof Tag; label: string; desc: string }[]> = {
  ADMIN: [
    { to: "/admin", icon: Users, label: "Admin console", desc: "Users, roles, system health & model status" },
    { to: "/products", icon: Tag, label: "Products", desc: "Full catalogue CRUD, CSV import/export, images" },
    { to: "/analytics", icon: LineChart, label: "Analytics", desc: "Portfolio-wide sentiment & review stats" },
    { to: "/alerts", icon: ShieldCheck, label: "Alerts", desc: "Low stock, negative & suspicious reviews" },
  ],
  ANALYST: [
    { to: "/analytics", icon: LineChart, label: "Analytics", desc: "Sentiment analytics & model performance" },
    { to: "/products", icon: TrendingUp, label: "Pricing & demand", desc: "Forecasts, SHAP, price simulator, competitors" },
    { to: "/alerts", icon: ShieldCheck, label: "Alerts", desc: "Inventory & review alerts" },
    { to: "/copilot", icon: Bot, label: "AI Copilot", desc: "Ask questions grounded in live data" },
  ],
  BUSINESS_USER: [
    { to: "/products", icon: Tag, label: "Browse products", desc: "Sentiment insights & demand forecasts" },
    { to: "/copilot", icon: Bot, label: "AI Copilot", desc: "Ask about products, reviews & forecasts" },
    { to: "/alerts", icon: ShieldCheck, label: "Alerts", desc: "Stay on top of negative reviews" },
  ],
};

export default function HomePage() {
  const { user } = useAuth();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: products } = useQuery({ queryKey: ["products", null, ""], queryFn: fetchProducts });

  if (!user) return null;
  const meta = ROLE_META[user.role];
  const trending = (products ?? []).slice(0, 10);

  // One real product photo per category, taken from a product in that category.
  const categoryPhotos = new Map<string, string>();
  for (const p of products ?? []) {
    if (!categoryPhotos.has(p.category) && p.image_url) {
      const url = mediaUrl(p.image_url);
      if (url) categoryPhotos.set(p.category, url);
    }
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-b from-amz-navy2 to-amz-bg px-4 pb-10 pt-8 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-start justify-between gap-4 rounded-lg bg-white p-6 shadow sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm text-amz-muted">
                Hello, {user.full_name.split(" ")[0]}
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.light}`}>
                  <ShieldCheck size={11} /> {meta.label}
                </span>
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Welcome back to SentiPrice AI</h1>
              <p className="mt-1 max-w-xl text-sm text-amz-muted">{meta.description}</p>
            </div>
            <Link to="/products" className="btn btn-orange shrink-0 px-5 py-2.5 font-medium">
              Shop all products <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-4 max-w-7xl px-4 sm:px-8">
        {/* Role quick actions */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_FEATURES[user.role].map((f) => (
            <Link key={f.to} to={f.to} className="card flex items-start gap-3 p-4 transition hover:shadow-md">
              <span className="rounded-full p-2" style={{ background: `${meta.accent}1a`, color: meta.accent }}>
                <f.icon size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold">{f.label}</span>
                <span className="block text-xs text-amz-muted">{f.desc}</span>
              </span>
            </Link>
          ))}
        </div>

        {/* Category tiles */}
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Shop by category</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {categories?.map((c) => {
              const Icon = categoryIcon(c);
              const photo = categoryPhotos.get(c);
              return (
                <Link key={c} to={`/products?category=${encodeURIComponent(c)}`} className="card flex flex-col items-center gap-2 p-3 text-center transition hover:shadow-md">
                  {photo ? (
                    <img
                      src={photo}
                      alt={c}
                      loading="lazy"
                      className="aspect-square w-full rounded bg-white object-contain"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amz-soft text-amz-navy2">
                      <Icon size={22} />
                    </span>
                  )}
                  <span className="line-clamp-2 text-xs font-medium">{c}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Trending products */}
        {trending.length > 0 && (
          <div className="mt-10 pb-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-lg font-bold"><Sparkles size={18} className="text-amz-orange" /> Featured products</h2>
              <Link to="/products" className="amz-link text-sm">See all</Link>
            </div>
            <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {trending.map((p) => (
                <Link key={p.id} to={`/products/${p.id}`} className="card w-40 shrink-0 p-3 transition hover:shadow-md">
                  <ProductImage imageUrl={p.image_url} name={p.name} category={p.category} className="aspect-square w-full rounded" />
                  <p className="mt-2 line-clamp-2 text-xs">{p.name}</p>
                  <p className="mt-1 text-sm font-semibold">{formatINR(p.current_price)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="card mb-10 flex items-start gap-3 p-4 text-sm text-amz-muted">
          <MessageSquareText size={18} className="mt-0.5 shrink-0 text-amz-link" />
          Try the <Link to="/copilot" className="amz-link font-medium">AI Copilot</Link> — ask things like
          "what's the demand forecast for the Nimbus 15 Pro Laptop?" and get an answer computed live from your data.
        </div>
      </div>
    </div>
  );
}
