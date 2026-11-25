import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Bot, ChevronDown, LogOut, Menu, Search, ShieldCheck, User as UserIcon, Wifi, WifiOff, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLiveStatus } from "@/lib/live";
import { navFor, ROLE_META } from "@/lib/roles";
import type { Alert } from "@/types/product";

function LiveDot() {
  const status = useLiveStatus();
  const color = status === "live" ? "bg-emerald-400" : status === "connecting" ? "bg-amber-400" : "bg-slate-500";
  const label = status === "live" ? "Live updates connected" : status === "connecting" ? "Connecting…" : "Live updates offline";
  return (
    <span className="hidden items-center gap-1.5 text-[11px] text-white/70 md:flex" title={label}>
      {status === "offline" ? <WifiOff size={12} /> : <Wifi size={12} />}
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Offline"}
    </span>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: unreadAlerts } = useQuery({
    queryKey: ["alerts", "unread-count"],
    queryFn: async () => (await api.get<Alert[]>("/alerts?unread_only=true")).data,
    enabled: !!user,
    staleTime: 15000,
  });

  if (!user) return null;
  const meta = ROLE_META[user.role];
  const items = navFor(user.role);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    navigate(`/products${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="sticky top-0 z-50">
      {/* Top bar */}
      <div className="flex items-center gap-2 bg-amz-navy px-3 py-2 text-white sm:gap-4 sm:px-4">
        <button className="lg:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <Link to="/" className="flex shrink-0 items-center gap-1 rounded border border-transparent px-2 py-1.5 hover:border-white">
          <span className="text-xl font-bold tracking-tight">sentiprice</span>
          <span className="text-xl font-bold text-amz-orange">.ai</span>
        </Link>

        <form onSubmit={handleSearch} className="hidden flex-1 items-stretch sm:flex">
          <select className="rounded-l-md border-r border-amz-border bg-[#f3f3f3] px-2 text-xs text-black focus:outline-none" aria-label="Category" defaultValue="all">
            <option value="all">All</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full px-3 py-2 text-sm text-black outline-none"
          />
          <button type="submit" className="flex items-center rounded-r-md bg-amz-orange px-4 text-black hover:bg-amz-buy" aria-label="Search">
            <Search size={18} />
          </button>
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LiveDot />

          <button
            onClick={() => navigate("/copilot")}
            className={`hidden items-center gap-1.5 rounded border border-transparent px-2 py-1.5 text-xs hover:border-white sm:flex ${location.pathname === "/copilot" ? "border-white" : ""}`}
          >
            <Bot size={20} />
            <span className="hidden font-bold md:inline">Copilot</span>
          </button>

          <button
            onClick={() => navigate("/alerts")}
            className="relative flex items-center gap-1.5 rounded border border-transparent px-2 py-1.5 text-xs hover:border-white"
          >
            <Bell size={20} />
            {!!unreadAlerts?.length && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amz-orange px-1 text-[10px] font-bold text-black">
                {unreadAlerts.length > 9 ? "9+" : unreadAlerts.length}
              </span>
            )}
            <span className="hidden font-bold md:inline">Alerts</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => window.setTimeout(() => setMenuOpen(false), 150)}
              className="flex items-center gap-1 rounded border border-transparent px-2 py-1.5 text-left hover:border-white"
            >
              <div className="flex items-center gap-1.5">
                <span className="hidden h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white sm:flex" style={{ background: meta.accent }}>
                  {user.full_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="hidden leading-tight sm:block">
                  <p className="text-[11px] text-white/80">Hello, {user.full_name.split(" ")[0]}</p>
                  <p className="flex items-center gap-1 text-xs font-bold">
                    {meta.label} <ChevronDown size={12} />
                  </p>
                </div>
                <UserIcon size={20} className="sm:hidden" />
              </div>
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-amz-border bg-white py-2 text-black shadow-xl"
                >
                  <div className="border-b border-amz-border px-4 pb-2">
                    <p className="truncate text-sm font-bold">{user.full_name}</p>
                    <p className="truncate text-xs text-amz-muted">{user.email}</p>
                    <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.light}`}>
                      <ShieldCheck size={11} /> {meta.label}
                    </span>
                  </div>
                  <Link to="/" className="block px-4 py-2 text-sm hover:bg-amz-soft">Dashboard</Link>
                  <Link to="/products" className="block px-4 py-2 text-sm hover:bg-amz-soft">All products</Link>
                  <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-amz-red hover:bg-amz-soft">
                    <LogOut size={14} /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile search */}
      <form onSubmit={handleSearch} className="flex bg-amz-navy px-3 pb-2 sm:hidden">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-l-md px-3 py-2 text-sm text-black outline-none"
        />
        <button type="submit" className="rounded-r-md bg-amz-orange px-4 text-black"><Search size={16} /></button>
      </form>

      {/* Secondary nav */}
      <nav className="hidden items-center gap-1 overflow-x-auto bg-amz-navy2 px-4 py-1.5 text-xs text-white no-scrollbar lg:flex">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`whitespace-nowrap rounded border border-transparent px-2 py-1 font-medium hover:border-white ${location.pathname === item.to ? "border-white" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-amz-navy2 text-white lg:hidden"
          >
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="block border-b border-white/10 px-4 py-3 text-sm font-medium"
              >
                {item.label}
              </Link>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
