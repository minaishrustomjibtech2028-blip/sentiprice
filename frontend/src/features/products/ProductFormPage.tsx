import { useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ImagePlus, Trash2, Upload } from "lucide-react";
import { z } from "zod";

import { inrInputToUsd, usdToInrInput } from "@/lib/money";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { ProductImage } from "@/components/ProductImage";
import type { Product } from "@/types/product";

const productSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  category: z.string().min(1, "Category is required").max(100),
  description: z.string().max(2000).optional(),
  base_price: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "Enter a positive number"),
  current_price: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "Enter a positive number"),
});
type ProductFormValues = z.infer<typeof productSchema>;

async function fetchProduct(id: string): Promise<Product> {
  const { data } = await api.get<Product>(`/products/${id}`);
  return data;
}

function ImagePanel({ product }: { product: Product }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/products/${product.id}/image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ kind: "success", title: "Image uploaded" });
    } catch (err) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        "Upload failed. Use a PNG, JPEG, WebP or GIF under 5 MB.";
      toast({ kind: "error", title: "Could not upload image", message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    try {
      await api.delete(`/products/${product.id}/image`);
      queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ kind: "success", title: "Image removed", message: "A generated placeholder will show instead." });
    } catch {
      toast({ kind: "error", title: "Could not remove image" });
    }
  }

  return (
    <div className="card p-4">
      <p className="mb-1 text-sm font-bold">Product photo</p>
      <p className="mb-3 text-xs text-amz-muted">
        Shown on the product card and detail page. Without an upload, shoppers see a generated placeholder instead.
      </p>
      <div className="flex items-start gap-4">
        <ProductImage imageUrl={product.image_url} name={product.name} category={product.category} className="h-32 w-32 shrink-0 rounded border border-amz-border" showPlaceholderBadge />
        <div className="space-y-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn btn-light">
            <Upload size={14} /> {uploading ? "Uploading…" : product.image_url ? "Replace photo" : "Upload photo"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} />
          {product.image_url && (
            <button type="button" onClick={handleRemove} className="btn btn-danger block">
              <Trash2 size={14} /> Remove photo
            </button>
          )}
          <p className="text-[11px] text-amz-muted">PNG, JPEG, WebP or GIF — up to 5 MB.</p>
        </div>
      </div>
    </div>
  );
}

export default function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isEditing = Boolean(productId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: existing } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProduct(productId as string),
    enabled: isEditing,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    values: existing
      ? {
          name: existing.name,
          category: existing.category,
          description: existing.description ?? "",
          base_price: usdToInrInput(existing.base_price),
          current_price: usdToInrInput(existing.current_price),
        }
      : undefined,
  });

  async function onSubmit(values: ProductFormValues) {
    setServerError(null);
    const usdValues = { ...values, base_price: inrInputToUsd(values.base_price), current_price: inrInputToUsd(values.current_price) };
    try {
      if (isEditing) {
        await api.patch(`/products/${productId}`, usdValues);
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["categories"] });
        queryClient.invalidateQueries({ queryKey: ["product", productId] });
        toast({ kind: "success", title: "Product updated", message: values.name });
        navigate(`/products/${productId}`);
      } else {
        const { data } = await api.post<Product>("/products", usdValues);
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["categories"] });
        toast({ kind: "success", title: "Product created", message: "Add a photo below, or do it later from the product page." });
        navigate(`/products/${data.id}/edit`, { replace: true });
      }
    } catch {
      setServerError("Could not save product. Please check the fields and try again.");
      reset(values);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to={isEditing ? `/products/${productId}` : "/products"} className="amz-link text-sm">
        ← Back
      </Link>
      <h1 className="mt-3 text-xl font-bold">{isEditing ? "Edit product" : "Add a new product"}</h1>

      <div className="mt-5 space-y-5">
        {isEditing && existing && <ImagePanel product={existing} />}

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-bold">Name</label>
            <input className="amz-input" {...register("name")} />
            {errors.name && <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.name.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold">Category</label>
            <input className="amz-input" placeholder="e.g. Electronics" {...register("category")} />
            {errors.category && <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.category.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold">Description</label>
            <textarea rows={4} placeholder={"One feature per line works best — it renders as a bullet list."} className="amz-input" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold">Base price (₹)</label>
              <input className="amz-input" {...register("base_price")} />
              {errors.base_price && <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.base_price.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">Current price (₹)</label>
              <input className="amz-input" {...register("current_price")} />
              {errors.current_price && <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.current_price.message}</p>}
            </div>
          </div>

          {serverError && (
            <div className="flex items-start gap-2 rounded-md border border-amz-red/30 bg-red-50 px-3 py-2 text-xs text-amz-red">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {serverError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="btn btn-orange w-full py-2 font-medium">
            {isSubmitting ? "Saving…" : isEditing ? "Save changes" : (
              <span className="inline-flex items-center gap-1.5"><ImagePlus size={14} /> Create product</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
