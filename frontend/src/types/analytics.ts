import type { ModelInfo } from "@/types/admin";

export interface CategoryStat {
  category: string;
  products: number;
  reviews: number;
  average_rating: number | null;
  positive: number;
  negative: number;
}

export interface AspectStat {
  aspect: string;
  positive: number;
  negative: number;
}

export interface DayCount {
  date: string;
  reviews: number;
}

export interface AnalyticsOverview {
  products_total: number;
  reviews_total: number;
  reviews_analyzed: number;
  reviews_pending: number;
  reviews_failed: number;
  positive: number;
  negative: number;
  average_sentiment_confidence: number | null;
  average_fake_score: number | null;
  suspicious_reviews: number;
  rating_distribution: Record<string, number>;
  emotion_distribution: Record<string, number>;
  by_category: CategoryStat[];
  aspects: AspectStat[];
  reviews_per_day: DayCount[];
}

export interface ModelPerformance {
  models: ModelInfo[];
}
