import type { ReactNode } from "react";

import { Header } from "@/components/Header";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-amz-bg text-[#0f1111]">
      <Header />
      <main className="flex-1">{children}</main>
      <footer className="mt-10 bg-amz-navy2 text-white">
        <div className="bg-amz-navy3 py-3 text-center text-xs hover:bg-slate-600">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="w-full">
            Back to top
          </button>
        </div>
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-white/70">
          <p className="font-bold text-white">SentiPrice AI</p>
          <p className="mt-1">Real-Time Sentiment Analysis of Product Reviews for E-Commerce Dynamic Pricing</p>
          <p className="mt-1">B.Tech Final Year Project — Academic demo, not a real storefront.</p>
        </div>
      </footer>
    </div>
  );
}
