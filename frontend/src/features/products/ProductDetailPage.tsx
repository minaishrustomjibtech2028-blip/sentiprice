import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChevronRight, ExternalLink, Pencil, ShieldCheck, Trash2, Truck } from "lucide-react";

import { formatINR } from "@/lib/money";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { ProductImage } from "@/components/ProductImage";
import { StarRating } from "@/components/StarRating";
import type { Product, Review } from "@/types/product";
import ReviewForm from "@/features/reviews/ReviewForm";
import SentimentBadge from "@/features/reviews/SentimentBadge";

async function fetchProduct(id: string): Promise<Product> {
  const { data } = await api.get<Product>(`/products/${id}`);
  return data;
}

async function fetchReviews(id: string): Promise<Review[]> {
  const { data } = await api.get<Review[]>(`/products/${id}/reviews`);
  return data;
}

function amazonProductUrl(description: string | null): string | undefined {
  const storedUrl = description?.match(/^Product page:\s*(\S+)/m)?.[1];
  if (!storedUrl) return;
  try {
    const url = new URL(storedUrl);
    const market = /^(?:www\.)?amazon\.(?:com|in|co\.uk|ca|de|fr|it|es|co\.jp|com\.au|com\.br|com\.mx|nl|se|pl|sg|ae|sa|com\.tr)$/i;
    if (url.protocol === "https:" && !url.username && !url.password && market.test(url.hostname)) {
      return url.href;
    }
  } catch {
    // Older catalogue rows may contain a malformed URL.
  }
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_1fr_280px]">
        <div className="skeleton aspect-square w-full rounded" />
        <div className="space-y-3">
          <div className="skeleton h-6 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-full" />
        </div>
        <div className="skeleton h-48 w-full rounded" />
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const id = productId as string;

  const {
    data: product,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id),
    enabled: Boolean(id),
  });

  const { data: reviews } = useQuery({
    queryKey: ["reviews", id],
    queryFn: () => fetchReviews(id),
    enabled: Boolean(id),
    // Poll while any review is still mid-analysis (background task not finished
    // yet), so the badge updates from "Analyzing…" to a real result without a
    // manual refresh. Stops once every review has a result or a recorded error.
    refetchInterval: (query) => {
      const data = query.state.data as Review[] | undefined;
      const stillPending = data?.some((r) => !r.analyzed_at && !r.analysis_error);
      return stillPending ? 3000 : false;
    },
  });

  function refreshAfterReview() {
    queryClient.invalidateQueries({ queryKey: ["reviews", id] });
    queryClient.invalidateQueries({ queryKey: ["product", id] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  }

  async function handleDelete() {
    if (!id || !product) return;
    if (!window.confirm(`Delete "${product.name}"? This also removes its reviews.`)) return;
    try {
      await api.delete(`/products/${id}`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ kind: "success", title: "Product deleted", message: product.name });
      navigate("/products");
    } catch {
      toast({ kind: "error", title: "Could not delete product" });
    }
  }

  if (isLoading) return <PageSkeleton />;

  if (error || !product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/products" className="amz-link text-sm">← Back to products</Link>
        <p className="mt-4 text-sm text-amz-red">Product not found.</p>
      </div>
    );
  }

  const amazonUrl = amazonProductUrl(product.description);
  const priceDropped = product.current_price !== product.base_price;

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
      <nav className="mb-3 flex items-center gap-1 text-xs text-amz-muted">
        <Link to="/products" className="amz-link">All products</Link>
        <ChevronRight size={12} />
        <Link to={`/products?category=${encodeURIComponent(product.category)}`} className="amz-link">{product.category}</Link>
        <ChevronRight size={12} />
        <span className="truncate text-[#0f1111]">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_280px]">
        {/* Image */}
        <div>
          <div className="card overflow-hidden">
            <ProductImage imageUrl={product.image_url} name={product.name} category={product.category} className="aspect-square w-full" showPlaceholderBadge />
          </div>
        </div>

        {/* Details */}
        <div>
          <p className="amz-link text-sm">{product.category}</p>
          <h1 className="mt-0.5 text-xl font-medium leading-snug">{product.name}</h1>

          <div className="mt-1.5 flex items-center gap-2">
            <StarRating value={product.average_rating ?? 0} size={16} />
            <Link to="#reviews" className="amz-link text-sm">
              {product.review_count} rating{product.review_count === 1 ? "" : "s"}
            </Link>
          </div>

          <div className="my-3 h-px bg-amz-border" />

          <div className="flex items-baseline gap-2">
            {priceDropped && <span className="text-sm text-amz-muted">List: <span className="line-through">{formatINR(product.base_price)}</span></span>}
          </div>
          <p className="text-2xl text-amz-price">
            {formatINR(product.current_price)}
          </p>
          {priceDropped && (
            <span className="mt-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-amz-red">
              {parseFloat(product.current_price) < parseFloat(product.base_price) ? "Price drop" : "Price increase"} ·
              {" "}{Math.abs(((parseFloat(product.current_price) - parseFloat(product.base_price)) / parseFloat(product.base_price)) * 100).toFixed(0)}%
            </span>
          )}

          {product.description && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-bold">About this item</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[#0f1111]">
                {product.description.split("\n").filter(Boolean).map((line, i) => (
                  <li key={i}>{line.startsWith("Product page:") && amazonUrl ? (
                    <a className="amz-link break-all" href={amazonUrl} target="_blank" rel="noopener noreferrer">{amazonUrl}</a>
                  ) : line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Buy box */}
        <div>
          <div className="card space-y-3 p-4">
            <p className="text-2xl text-amz-price">
              {formatINR(product.current_price)}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-amz-green">
              <Truck size={14} /> In stock — dynamically priced by our ML engine
            </p>
            <p className="text-xs text-amz-muted">
              Pricing is computed live from demand forecasts, sentiment and competitor data — never a static markup.
            </p>

            {amazonUrl && (
              <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="btn btn-orange w-full font-medium">
                <ExternalLink size={14} /> View on Amazon
              </a>
            )}

            {user?.role === "ADMIN" && (
              <div className="space-y-2 border-t border-amz-border pt-3">
                <Link to={`/products/${product.id}/analysis`} className="btn btn-orange w-full font-medium">
                  <BarChart3 size={14} /> Review analysis & pricing
                </Link>
                <Link to={`/products/${product.id}/edit`} className="btn btn-light w-full">
                  <Pencil size={14} /> Edit product
                </Link>
                <button onClick={handleDelete} className="btn btn-danger w-full">
                  <Trash2 size={14} /> Delete product
                </button>
              </div>
            )}
            {(user?.role === "ANALYST" || user?.role === "BUSINESS_USER") && (
              <Link to={`/products/${product.id}/analysis`} className="btn btn-light w-full border-t border-amz-border pt-3 font-medium">
                <BarChart3 size={14} /> {user.role === "ANALYST" ? "Pricing & demand analysis" : "Sentiment & demand insights"}
              </Link>
            )}
          </div>

          <div className="card mt-3 flex items-start gap-2 p-3 text-xs text-amz-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-amz-green" />
            Every sentiment score, demand forecast and price shown for this product comes from the trained ML
            pipeline running on real review data — nothing here is hardcoded.
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div id="reviews" className="mt-10 grid grid-cols-1 gap-8 border-t border-amz-border pt-8 md:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <h2 className="text-lg font-bold">Customer reviews</h2>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl font-medium">{(product.average_rating ?? 0).toFixed(1)}</span>
            <div>
              <StarRating value={product.average_rating ?? 0} size={18} />
              <p className="text-xs text-amz-muted">{product.review_count} global rating{product.review_count === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-amz-border p-4">
            <h3 className="mb-3 text-sm font-bold">Write a customer review</h3>
            <ReviewForm productId={product.id} onSubmitted={refreshAfterReview} />
          </div>
        </div>

        <div>
          {reviews && reviews.length === 0 && (
            <div className="card p-6 text-center text-sm text-amz-muted">No reviews yet — be the first to share your thoughts.</div>
          )}
          <div className="space-y-5">
            {reviews?.map((r) => (
              <div key={r.id} className="border-b border-amz-border pb-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amz-navy3 text-xs font-bold text-white">
                    {r.reviewer_display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold">{r.reviewer_display_name}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StarRating value={r.rating} size={13} />
                  <span className="text-xs text-amz-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm text-[#0f1111]">{r.content}</p>
                <div className="mt-2.5">
                  <SentimentBadge review={r} />
                </div>
                {r.aspects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.aspects.map((a, i) => (
                      <span
                        key={i}
                        className={`rounded border px-1.5 py-0.5 text-[11px] capitalize ${
                          a.sentiment_label === "POSITIVE"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : a.sentiment_label === "NEGATIVE"
                              ? "border-red-300 bg-red-50 text-amz-red"
                              : "border-amz-border bg-amz-soft text-amz-muted"
                        }`}
                      >
                        {a.aspect}: {a.sentiment_label.toLowerCase()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
