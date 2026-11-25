import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { AlertCircle, Boxes, Lock, Plus, TrendingUp } from "lucide-react";

import { formatINR, inrInputToUsd } from "@/lib/money";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import type {
  CompetitorPrice, ForecastResponse, InventoryInfo, MLPriceRecommendation,
  PriceSimulationRequest, Product, SentimentSummary,
} from "@/types/product";

async function fetchProduct(id: string): Promise<Product> {
  const { data } = await api.get<Product>(`/products/${id}`);
  return data;
}
async function fetchSentimentSummary(id: string): Promise<SentimentSummary> {
  const { data } = await api.get<SentimentSummary>(`/products/${id}/reviews/sentiment-summary`);
  return data;
}
async function fetchForecast(id: string): Promise<ForecastResponse> {
  const { data } = await api.get<ForecastResponse>(`/products/${id}/forecast`);
  return data;
}
async function fetchMlPriceRecommendation(id: string): Promise<MLPriceRecommendation> {
  const { data } = await api.get<MLPriceRecommendation>(`/products/${id}/price-recommendation-ml`);
  return data;
}
async function fetchCompetitorPrices(id: string): Promise<CompetitorPrice[]> {
  const { data } = await api.get<CompetitorPrice[]>(`/products/${id}/competitor-prices`);
  return data;
}
async function fetchInventory(id: string): Promise<InventoryInfo | null> {
  try {
    const { data } = await api.get<InventoryInfo>(`/products/${id}/inventory`);
    return data;
  } catch {
    return null;
  }
}

const CONFIDENCE_STYLES: Record<string, string> = {
  none: "text-amz-muted", low: "text-amber-600", medium: "text-amz-link", high: "text-amz-green",
};

function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card mt-5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-amz-muted">{title}</p>
        {badge}
      </div>
      {children}
    </div>
  );
}

function RestrictedNotice({ roleNeeded }: { roleNeeded: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amz-border bg-amz-soft p-3 text-xs text-amz-muted">
      <Lock size={14} className="mt-0.5 shrink-0" /> Available to {roleNeeded}. Your account can still see sentiment and demand forecasts above.
    </div>
  );
}

export default function ProductAnalysisPage() {
  const { productId } = useParams<{ productId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const id = productId as string;
  const canSeePricingIntel = user?.role === "ADMIN" || user?.role === "ANALYST";
  const canEditOps = user?.role === "ADMIN";

  const [simCompetitor, setSimCompetitor] = useState("");
  const [simBasePrice, setSimBasePrice] = useState("");
  const [simStock, setSimStock] = useState("");
  const [simResult, setSimResult] = useState<MLPriceRecommendation | null>(null);

  const { data: product } = useQuery({ queryKey: ["product", id], queryFn: () => fetchProduct(id) });
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["sentiment-summary", id], queryFn: () => fetchSentimentSummary(id),
  });
  const { data: forecast, isLoading: forecastLoading, error: forecastError } = useQuery({
    queryKey: ["forecast", id], queryFn: () => fetchForecast(id),
  });
  const { data: priceRec, isLoading: priceLoading, error: priceError } = useQuery({
    queryKey: ["ml-price-recommendation", id], queryFn: () => fetchMlPriceRecommendation(id), enabled: canSeePricingIntel,
  });
  const { data: competitorPrices } = useQuery({
    queryKey: ["competitor-prices", id], queryFn: () => fetchCompetitorPrices(id), enabled: canSeePricingIntel,
  });
  const { data: inventory } = useQuery({
    queryKey: ["inventory", id], queryFn: () => fetchInventory(id), enabled: canSeePricingIntel,
  });

  const applyPriceMutation = useMutation({
    mutationFn: async () => (await api.post<Product>(`/products/${id}/apply-recommended-price`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["ml-price-recommendation", id] });
      toast({ kind: "success", title: "Price updated", message: "The product now uses the recommended price." });
    },
    onError: () => toast({ kind: "error", title: "Could not apply price", message: "Please try again." }),
  });

  const simulateMutation = useMutation({
    mutationFn: async (payload: PriceSimulationRequest) => (await api.post<MLPriceRecommendation>(`/products/${id}/price-simulate`, payload)).data,
    onSuccess: (data) => setSimResult(data),
    onError: () => toast({ kind: "error", title: "Simulation failed", message: "Check your inputs and try again." }),
  });

  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [newCompetitorPrice, setNewCompetitorPrice] = useState("");
  const addCompetitorMutation = useMutation({
    mutationFn: async () => api.post(`/products/${id}/competitor-prices`, { competitor_name: newCompetitorName, price: inrInputToUsd(newCompetitorPrice) }),
    onSuccess: () => {
      setNewCompetitorName(""); setNewCompetitorPrice("");
      queryClient.invalidateQueries({ queryKey: ["competitor-prices", id] });
      toast({ kind: "success", title: "Competitor price added" });
    },
  });

  const [stockInput, setStockInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("");
  const updateInventoryMutation = useMutation({
    mutationFn: async () => api.put(`/products/${id}/inventory`, { stock_level: Number(stockInput), reorder_threshold: Number(thresholdInput) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", id] });
      toast({ kind: "success", title: "Inventory updated" });
    },
  });

  function runSimulation() {
    const payload: PriceSimulationRequest = {};
    if (simBasePrice) payload.hypothetical_base_price = inrInputToUsd(simBasePrice);
    if (simCompetitor) payload.hypothetical_competitor_avg_price = inrInputToUsd(simCompetitor);
    if (simStock) payload.hypothetical_stock_level = Number(simStock);
    simulateMutation.mutate(payload);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to={`/products/${id}`} className="amz-link text-sm">← Back to product</Link>
      <h1 className="mt-3 text-xl font-bold">Review Analysis &amp; Pricing</h1>
      {product && <p className="mt-1 text-sm text-amz-muted">{product.name} · {product.category}</p>}

      <Section title="Sentiment summary">
        {summaryLoading && <p className="text-sm text-amz-muted">Loading…</p>}
        {summary && summary.analyzed_review_count === 0 && <p className="text-sm text-amz-muted">No reviews analyzed yet for this product.</p>}
        {summary && summary.analyzed_review_count > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-5 text-sm">
              <div><span className="text-amz-muted">Analyzed:</span> {summary.analyzed_review_count}</div>
              <div className="text-amz-green">Positive: {summary.positive_count}</div>
              <div className="text-amz-red">Negative: {summary.negative_count}</div>
            </div>
            {summary.top_aspects.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {summary.top_aspects.map((a) => (
                  <span key={a.aspect} className="rounded-full border border-amz-border bg-amz-soft px-2 py-0.5 text-xs capitalize text-[#0f1111]">
                    {a.aspect} ({a.mentions})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="7-day demand forecast" badge={<TrendingUp size={14} className="text-amz-muted" />}>
        {forecastLoading && <p className="text-sm text-amz-muted">Loading…</p>}
        {forecastError && <p className="text-sm text-amz-red">Forecast unavailable — the demand model artifact may not be trained yet.</p>}
        {forecast && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast.days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#565959" }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "#565959" }} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #d5d9d9", fontSize: 12 }} />
                <Line type="monotone" dataKey="predicted_units" stroke="#ff9900" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section
        title="Price recommendation"
        badge={<span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">ML: demand model + SHAP</span>}
      >
        {!canSeePricingIntel && <RestrictedNotice roleNeeded="Analysts and Admins" />}
        {canSeePricingIntel && priceLoading && <p className="text-sm text-amz-muted">Calculating…</p>}
        {canSeePricingIntel && priceError && <p className="text-sm text-amz-red">Price recommendation unavailable — the demand model artifact may not be trained yet.</p>}
        {canSeePricingIntel && priceRec && (
          <PriceRecDisplay
            rec={priceRec}
            basePrice={product?.base_price}
            canApply={user?.role === "ADMIN"}
            applying={applyPriceMutation.isPending}
            onApply={() => applyPriceMutation.mutate()}
          />
        )}
      </Section>

      {canSeePricingIntel && (
        <Section title="Price simulator">
          <p className="mb-3 text-xs text-amz-muted">
            Try hypothetical inputs — every result below still comes from the real model, just run against these
            overrides instead of the product's current data.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input placeholder="Hypothetical base price (₹)" value={simBasePrice} onChange={(e) => setSimBasePrice(e.target.value)} className="amz-input" />
            <input placeholder="Hypothetical competitor avg (₹)" value={simCompetitor} onChange={(e) => setSimCompetitor(e.target.value)} className="amz-input" />
            <input placeholder="Hypothetical stock level" value={simStock} onChange={(e) => setSimStock(e.target.value)} className="amz-input" />
          </div>
          <button onClick={runSimulation} disabled={simulateMutation.isPending} className="btn btn-orange mt-3 font-medium">
            {simulateMutation.isPending ? "Running…" : "Run simulation"}
          </button>
          {simResult && (
            <div className="mt-4 border-t border-amz-border pt-4">
              <PriceRecDisplay rec={simResult} basePrice={simResult.base_price} />
            </div>
          )}
        </Section>
      )}

      <Section title="Competitor prices (manually entered demo data)">
        {!canSeePricingIntel && <RestrictedNotice roleNeeded="Analysts and Admins" />}
        {canSeePricingIntel && (
          <>
            <div className="space-y-1.5">
              {competitorPrices?.length === 0 && <p className="text-sm text-amz-muted">No competitor prices recorded yet.</p>}
              {competitorPrices?.map((c) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <span>{c.competitor_name}</span>
                  <span className="text-amz-muted">{formatINR(c.price)}</span>
                </div>
              ))}
            </div>
            {canEditOps && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input placeholder="Competitor name" value={newCompetitorName} onChange={(e) => setNewCompetitorName(e.target.value)} className="amz-input flex-1" />
                <input placeholder="Price (₹)" value={newCompetitorPrice} onChange={(e) => setNewCompetitorPrice(e.target.value)} className="amz-input w-28" />
                <button onClick={() => addCompetitorMutation.mutate()} disabled={!newCompetitorName || !newCompetitorPrice} className="btn btn-light">
                  <Plus size={14} /> Add
                </button>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Inventory" badge={<Boxes size={14} className="text-amz-muted" />}>
        {!canSeePricingIntel && <RestrictedNotice roleNeeded="Analysts and Admins" />}
        {canSeePricingIntel && (
          <>
            {inventory ? (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span>Stock: <strong>{inventory.stock_level}</strong></span>
                <span className="text-amz-muted">Reorder at: {inventory.reorder_threshold}</span>
                {inventory.is_low_stock && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <AlertCircle size={12} /> Low stock
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-amz-muted">No inventory record yet.</p>
            )}
            {canEditOps && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input placeholder="Stock level" value={stockInput} onChange={(e) => setStockInput(e.target.value)} className="amz-input w-32" />
                <input placeholder="Reorder threshold" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="amz-input w-36" />
                <button onClick={() => updateInventoryMutation.mutate()} disabled={!stockInput || !thresholdInput} className="btn btn-light">Save</button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function PriceRecDisplay({
  rec, basePrice, canApply = false, applying = false, onApply,
}: {
  rec: MLPriceRecommendation;
  basePrice?: string;
  canApply?: boolean;
  applying?: boolean;
  onApply?: () => void;
}) {
  const delta = parseFloat(rec.recommended_price) - parseFloat(basePrice ?? rec.base_price);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-4">
        <div>
          <p className="text-xs text-amz-muted">Base price</p>
          <p className="text-lg font-medium">{formatINR(basePrice ?? rec.base_price)}</p>
        </div>
        <span className="text-amz-muted">→</span>
        <div>
          <p className="text-xs text-amz-muted">Recommended price</p>
          <p className="text-lg font-semibold text-amz-price">{formatINR(rec.recommended_price)}</p>
        </div>
        <span className={`text-sm font-medium ${delta >= 0 ? "text-amz-green" : "text-amz-red"}`}>
          {delta >= 0 ? "+" : "-"}{formatINR(Math.abs(delta))} ({(rec.adjustment_pct * 100).toFixed(1)}%)
        </span>
      </div>

      {canApply && onApply && (
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="mt-3 rounded-full bg-amz-orange px-4 py-1.5 text-sm font-medium text-black hover:brightness-95 disabled:opacity-60"
        >
          {applying ? "Applying…" : `Apply recommended price (${formatINR(rec.recommended_price)})`}
        </button>
      )}

      <p className={`mt-2 text-xs ${CONFIDENCE_STYLES[rec.confidence] ?? "text-amz-muted"}`}>
        Confidence: {rec.confidence} · Predicted demand at recommended price: {rec.predicted_demand_units} units/day
      </p>

      {rec.reasoning.length > 0 && (
        <div className="mt-3 rounded-md border border-amz-border bg-amz-soft p-3">
          <p className="mb-1.5 text-xs font-bold text-amz-muted">Why this recommendation:</p>
          <ul className="space-y-1 text-xs">
            {rec.reasoning.map((line, i) => <li key={i}>• {line}</li>)}
          </ul>
        </div>
      )}

      {rec.shap_breakdown.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-bold text-amz-muted">SHAP feature contributions (demand model, at recommended price):</p>
          <div className="space-y-1">
            {rec.shap_breakdown.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-40 truncate text-amz-muted">{s.feature}</span>
                <div className="h-2 flex-1 rounded bg-amz-soft">
                  <div className={`h-2 rounded ${s.contribution >= 0 ? "bg-amz-green" : "bg-amz-red"}`} style={{ width: `${Math.min(100, Math.abs(s.contribution) * 15)}%` }} />
                </div>
                <span className="w-12 text-right text-amz-muted">{s.contribution.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
