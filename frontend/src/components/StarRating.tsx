import { Star, StarHalf } from "lucide-react";

export function StarRating({ value, size = 14, showValue = false, count }: { value: number; size?: number; showValue?: boolean; count?: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.25 && value - full < 0.75;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="inline-flex items-center gap-1 text-amz-star">
      <span className="flex">
        {Array.from({ length: full }).map((_, i) => (
          <Star key={`f${i}`} size={size} fill="currentColor" stroke="none" />
        ))}
        {half && <StarHalf size={size} fill="currentColor" stroke="none" />}
        {Array.from({ length: Math.max(empty, 0) }).map((_, i) => (
          <Star key={`e${i}`} size={size} fill="none" stroke="currentColor" strokeWidth={1.5} />
        ))}
      </span>
      {showValue && <span className="text-xs font-medium text-amz-link">{value.toFixed(1)}</span>}
      {typeof count === "number" && <span className="text-xs text-amz-link">({count})</span>}
    </span>
  );
}
