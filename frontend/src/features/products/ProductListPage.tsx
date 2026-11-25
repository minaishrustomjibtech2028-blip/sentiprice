import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, SlidersHorizontal, Upload, X } from "lucide-react";

import { formatINR } from "@/lib/money";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { categoryIcon } from "@/lib/categoryIcons";
import { ProductImage } from "@/components/ProductImage";
import { StarRating } from "@/components/StarRating";
import type { ImportResult, Product } from "@/types/product";

async function fetchProducts(category: string | null, search: string): Promise<Product[]> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  const { data } = await api.get<Product[]>(`/products?${params.toString()}`);
  return data;
}

async function fetchCategories(): Promise<string[]> {
  const { data } = await api.get<string[]>("/products/categories");
  return data;
}

function ProductCardSkeleton() {
  return (
    <div className="card flex flex-col p-3">
      <div className="skeleton aspect-square w-full" />
      <div className="skeleton mt-3 h-4 w-3/4" />
      <div className="skeleton mt-2 h-3 w-1/2" />
      <div className="skeleton mt-2 h-5 w-1/3" />
    </div>
  );
}

export default function ProductListPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<string | null>(searchParams.get("category"));
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setCategory(searchParams.get("category"));
  }, [searchParams]);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const {
    data: products,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["products", category, search],
    queryFn: () => fetchProducts(category, search),
  });

  function applyCategory(next: string | null) {
    setCategory(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("category", next);
    else params.delete("category");
    setSearchParams(params, { replace: true });
    setSidebarOpen(false);
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post<ImportResult>("/products/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast({
        kind: data.errors.length ? "warning" : "success",
        title: `Imported ${data.created} product(s)`,
        message: `${data.skipped} skipped.` + (data.errors.length ? ` First error: ${data.errors[0]}` : ""),
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } catch {
      toast({ kind: "error", title: "Import failed", message: "Check the CSV format and try again." });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleExport() {
    api
      .get("/products/export", { responseType: "blob" })
      .then(({ data }) => {
        const url = window.URL.createObjectURL(new Blob([data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "products_export.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => toast({ kind: "error", title: "Export failed" }));
  }

  const sidebar = (
    <>
      <p className="mb-2 text-sm font-bold">Category</p>
      <ul className="space-y-0.5 text-sm">
        <li>
          <button
            onClick={() => applyCategory(null)}
            className={`w-full rounded px-2 py-1.5 text-left hover:bg-amz-soft ${!category ? "font-bold text-amz-hover" : ""}`}
          >
            All categories
          </button>
        </li>
        {categories?.map((c) => {
          const Icon = categoryIcon(c);
          return (
            <li key={c}>
              <button
                onClick={() => applyCategory(c)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-amz-soft ${category === c ? "font-bold text-amz-hover" : ""}`}
              >
                <Icon size={14} className="shrink-0 text-amz-muted" />
                <span className="truncate">{c}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amz-muted" />
          <input
            type="text"
            placeholder="Search within results…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              const params = new URLSearchParams(searchParams);
              if (e.target.value) params.set("search", e.target.value);
              else params.delete("search");
              setSearchParams(params, { replace: true });
            }}
            className="amz-input pl-8"
          />
        </div>
        <button onClick={() => setSidebarOpen(true)} className="btn btn-light lg:hidden">
          <SlidersHorizontal size={14} /> Filter
        </button>

        {user?.role === "ADMIN" && (
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/products/new" className="btn btn-orange font-medium">
              <Plus size={14} /> Add product
            </Link>
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-light">
              <Upload size={14} /> Import CSV
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <button onClick={handleExport} className="btn btn-light">
              <Download size={14} /> Export CSV
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="card sticky top-36 p-4">{sidebar}</div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Filters</p>
                <button onClick={() => setSidebarOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              {sidebar}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="mb-3 text-sm text-amz-muted">
            {isLoading ? "Searching…" : `${products?.length ?? 0} result${products?.length === 1 ? "" : "s"}`}
            {category && <> in <span className="font-semibold text-[#0f1111]">{category}</span></>}
            {search && <> for "<span className="font-semibold text-[#0f1111]">{search}</span>"</>}
          </p>

          {error && (
            <div className="card p-6 text-center text-sm text-amz-red">Failed to load products. Please try again.</div>
          )}

          {!isLoading && products && products.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-base font-semibold">No products matched your search.</p>
              <p className="mt-1 text-sm text-amz-muted">Try a different keyword or clear the category filter.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {isLoading && Array.from({ length: 10 }).map((_, i) => <ProductCardSkeleton key={i} />)}

            {products?.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="card group flex flex-col overflow-hidden p-3 transition hover:shadow-md"
              >
                <ProductImage imageUrl={p.image_url} name={p.name} category={p.category} className="aspect-square w-full rounded" showPlaceholderBadge />
                <p className="mt-3 line-clamp-2 text-sm text-[#0f1111] group-hover:text-amz-hover">{p.name}</p>
                <div className="mt-1">
                  <StarRating value={p.average_rating ?? 0} count={p.review_count} />
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-[#0f1111]">
                    
                    {formatINR(p.current_price)}
                  </span>
                  {p.current_price !== p.base_price && (
                    <span className="text-xs text-amz-muted line-through">{formatINR(p.base_price)}</span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-amz-muted">{p.category}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
