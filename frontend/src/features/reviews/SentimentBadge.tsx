import { useEffect, useState } from "react";
import { AlertTriangle, Frown, Loader2, Meh, Smile } from "lucide-react";

import type { Review } from "@/types/product";

const SENTIMENT_STYLES: Record<string, { cls: string; icon: typeof Smile }> = {
  POSITIVE: { cls: "bg-emerald-50 text-emerald-700 border-emerald-300", icon: Smile },
  NEGATIVE: { cls: "bg-red-50 text-amz-red border-red-300", icon: Frown },
};

/**
 * Shows the real analysis state of a review:
 * - analyzed_at set -> real sentiment/emotion badges from the model
 * - analysis_error set -> honest "analysis unavailable" notice (never a fake score)
 * - neither -> "Analyzing…" (background task hasn't completed yet)
 */
export default function SentimentBadge({ review }: { review: Review }) {
  const pending = !review.analyzed_at && !review.analysis_error;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const remaining = 45_000 - (Date.now() - Date.parse(review.created_at));
    const timer = window.setTimeout(() => setSlow(true), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [pending, review.created_at]);

  if (review.analyzed_at && review.sentiment_label) {
    const style = SENTIMENT_STYLES[review.sentiment_label] ?? { cls: "bg-amz-soft text-amz-muted border-amz-border", icon: Meh };
    const Icon = style.icon;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.cls}`}>
          <Icon size={12} />
          {review.sentiment_label.charAt(0) + review.sentiment_label.slice(1).toLowerCase()}
          {review.sentiment_score !== null && ` · ${(review.sentiment_score * 100).toFixed(0)}%`}
        </span>
        {review.emotion_label && (
          <span className="rounded-full border border-amz-border bg-amz-soft px-2 py-0.5 text-xs capitalize text-amz-muted">
            {review.emotion_label}
          </span>
        )}
        {review.fake_score !== null && review.fake_score > 0.5 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            <AlertTriangle size={11} /> Possibly suspicious ({(review.fake_score * 100).toFixed(0)}%)
          </span>
        )}
      </div>
    );
  }

  if (review.analysis_error) {
    return (
      <span
        className="rounded-full border border-amz-border bg-amz-soft px-2 py-0.5 text-xs text-amz-muted"
        title={review.analysis_error}
      >
        Analysis unavailable
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amz-border bg-amz-soft px-2 py-0.5 text-xs text-amz-muted">
      <Loader2 size={11} className="animate-spin" /> {slow ? "Review saved · Analysis is taking longer than usual" : "Analyzing…"}
    </span>
  );
}
