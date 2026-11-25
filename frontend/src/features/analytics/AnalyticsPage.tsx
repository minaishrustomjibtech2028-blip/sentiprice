import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Cpu, LineChart as LineChartIcon, ShieldAlert, Smile } from "lucide-react";

import { api } from "@/lib/api";
import type { AnalyticsOverview, ModelPerformance } from "@/types/analytics";

async function fetchOverview(): Promise<AnalyticsOverview> {
  const { data } = await api.get<AnalyticsOverview>("/analytics/overview");
  return data;
}
async function fetchModelPerformance(): Promise<ModelPerformance> {
  const { data } = await api.get<ModelPerformance>("/analytics/model-performance");
  return data;
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-bold" style={{ color: accent }}>{value}</p>
      <p className="text-xs text-amz-muted">{label}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["analytics", "overview"], queryFn: fetchOverview, refetchInterval: 20000 });
  const { data: perf } = useQuery({ queryKey: ["analytics", "model-performance"], queryFn: fetchModelPerformance });

  if (isLoading || !data) {
    return <div className="mx-auto max-w-7xl px-4 py-8"><p className="text-sm text-amz-muted">Loading analytics…</p></div>;
  }

  const ratingData = Object.entries(data.rating_distribution).map(([rating, count]) => ({ rating: `${rating}★`, count }));
  const emotionData = Object.entries(data.emotion_distribution).map(([emotion, count]) => ({ emotion, count }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold"><LineChartIcon size={20} /> Analytics</h1>
      <p className="mb-5 text-sm text-amz-muted">Every figure below is computed live from stored reviews and products — nothing is hardcoded.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Products" value={data.products_total} accent="#2563eb" />
        <Stat label="Reviews analyzed" value={`${data.reviews_analyzed}/${data.reviews_total}`} accent="#059669" />
        <Stat label="Positive / Negative" value={`${data.positive} / ${data.negative}`} accent="#ff9900" />
        <Stat label="Suspicious reviews" value={data.suspicious_reviews} accent="#cc0c39" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <p className="mb-3 text-sm font-bold">Reviews over the last 14 days</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.reviews_per_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#565959" }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "#565959" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #d5d9d9", fontSize: 12 }} />
                <Line type="monotone" dataKey="reviews" stroke="#007185" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <p className="mb-3 text-sm font-bold">Rating distribution</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="rating" tick={{ fontSize: 11, fill: "#565959" }} />
                <YAxis tick={{ fontSize: 11, fill: "#565959" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #d5d9d9", fontSize: 12 }} />
                <Bar dataKey="count" fill="#ff9900" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {emotionData.length > 0 && (
        <div className="card mt-5 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold"><Smile size={15} /> Emotion distribution</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emotionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#565959" }} allowDecimals={false} />
                <YAxis type="category" dataKey="emotion" width={80} tick={{ fontSize: 11, fill: "#565959" }} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #d5d9d9", fontSize: 12 }} />
                <Bar dataKey="count" fill="#7c3aed" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card mt-5 overflow-x-auto p-4">
        <p className="mb-3 text-sm font-bold">By category</p>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-amz-border text-xs uppercase text-amz-muted">
              <th className="py-2 pr-3">Category</th><th className="py-2 pr-3">Products</th><th className="py-2 pr-3">Reviews</th>
              <th className="py-2 pr-3">Avg rating</th><th className="py-2 pr-3">Positive</th><th className="py-2 pr-3">Negative</th>
            </tr>
          </thead>
          <tbody>
            {data.by_category.map((c) => (
              <tr key={c.category} className="border-b border-amz-border last:border-0">
                <td className="py-2 pr-3 font-medium">{c.category}</td>
                <td className="py-2 pr-3">{c.products}</td>
                <td className="py-2 pr-3">{c.reviews}</td>
                <td className="py-2 pr-3">{c.average_rating !== null ? `${c.average_rating.toFixed(1)} ★` : "—"}</td>
                <td className="py-2 pr-3 text-amz-green">{c.positive}</td>
                <td className="py-2 pr-3 text-amz-red">{c.negative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.aspects.length > 0 && (
        <div className="card mt-5 p-4">
          <p className="mb-3 text-sm font-bold">Most-mentioned aspects (ABSA)</p>
          <div className="flex flex-wrap gap-2">
            {data.aspects.map((a) => (
              <span key={a.aspect} className="rounded-full border border-amz-border bg-amz-soft px-3 py-1 text-xs capitalize">
                {a.aspect} <span className="text-amz-green">+{a.positive}</span> / <span className="text-amz-red">-{a.negative}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {perf && (
        <div className="card mt-5 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold"><Cpu size={15} /> Model performance</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {perf.models.map((m) => (
              <div key={m.key} className="rounded-md border border-amz-border p-3">
                <p className="text-sm font-bold">{m.name}</p>
                <p className="text-xs text-amz-muted">{m.kind}</p>
                {Object.entries(m.metrics).filter(([, v]) => v !== null && v !== undefined).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {Object.entries(m.metrics).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => (
                      <span key={k}><span className="text-amz-muted">{k.replace(/_/g, " ")}:</span> {v}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-5 flex items-start gap-2 p-4 text-xs text-amz-muted">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        {data.average_sentiment_confidence !== null
          ? `Average model confidence across analyzed reviews: ${(data.average_sentiment_confidence * 100).toFixed(0)}%.`
          : "No reviews have been analyzed yet, so confidence and fake-score averages aren't available."}
      </div>
    </div>
  );
}
