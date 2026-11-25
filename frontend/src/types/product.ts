/**
 * Shared product/review types — mirrors backend/app/schemas/product.py
 * and backend/app/schemas/review.py.
 */
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  image_url: string | null;
  base_price: string;
  current_price: string;
  created_at: string;
  updated_at: string;
  review_count: number;
  average_rating: number | null;
}

export interface ProductCreatePayload {
  name: string;
  category: string;
  description?: string;
  base_price: string;
  current_price: string;
}

export interface ProductUpdatePayload {
  name?: string;
  category?: string;
  description?: string;
  base_price?: string;
  current_price?: string;
}

export interface AspectSentiment {
  aspect: string;
  sentiment_label: string;
  sentiment_score: number;
  evidence_text: string;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  reviewer_display_name: string;
  content: string;
  rating: number;
  created_at: string;
  sentiment_label: string | null;
  sentiment_score: number | null;
  emotion_label: string | null;
  emotion_score: number | null;
  fake_score: number | null;
  analyzed_at: string | null;
  analysis_error: string | null;
  aspects: AspectSentiment[];
}

export interface SentimentSummary {
  product_id: string;
  analyzed_review_count: number;
  positive_count: number;
  negative_count: number;
  average_sentiment_score: number | null;
  average_fake_score: number | null;
  average_rating: number | null;
  top_aspects: { aspect: string; mentions: number }[];
}

export interface PriceRecommendation {
  product_id: string;
  current_price: string;
  base_price: string;
  recommended_price: string;
  adjustment_pct: number;
  confidence: string;
  reasoning: string[];
  is_interim_heuristic: boolean;
}

export interface ForecastDay {
  date: string;
  predicted_units: number;
}

export interface ForecastResponse {
  product_id: string;
  category: string;
  price_used: string;
  days: ForecastDay[];
}

export interface ShapContribution {
  feature: string;
  contribution: number;
}

export interface MLPriceRecommendation {
  product_id: string;
  current_price: string;
  base_price: string;
  recommended_price: string;
  ml_optimal_price: string;
  predicted_demand_units: number;
  adjustment_pct: number;
  confidence: string;
  reasoning: string[];
  shap_breakdown: ShapContribution[];
  competitor_avg_price: string | null;
  is_interim_heuristic: boolean;
}

export interface CompetitorPrice {
  id: string;
  product_id: string;
  competitor_name: string;
  price: string;
  recorded_at: string;
}

export interface InventoryInfo {
  product_id: string;
  stock_level: number;
  reorder_threshold: number;
  is_low_stock: boolean;
  updated_at: string;
}

export interface PriceSimulationRequest {
  hypothetical_base_price?: string;
  hypothetical_competitor_avg_price?: string;
  hypothetical_stock_level?: number;
}

export interface ReviewCreatePayload {
  content: string;
  rating: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface Alert {
  id: string;
  product_id: string;
  alert_type: string;
  message: string;
  severity: string;
  is_read: boolean;
  created_at: string;
}
