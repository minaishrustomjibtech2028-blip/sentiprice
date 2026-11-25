import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Send, Star } from "lucide-react";
import { z } from "zod";

import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

const reviewSchema = z.object({
  content: z.string().min(1, "Review text is required").max(5000),
  rating: z.number().min(1).max(5),
});
type ReviewFormValues = z.infer<typeof reviewSchema>;

export default function ReviewForm({
  productId,
  onSubmitted,
}: {
  productId: string;
  onSubmitted: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [hover, setHover] = useState(0);
  const toast = useToast();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { content: "", rating: 5 },
  });
  const rating = watch("rating");

  async function onSubmit(values: ReviewFormValues) {
    setServerError(null);
    try {
      await api.post(`/products/${productId}/reviews`, values);
      reset({ content: "", rating: 5 });
      onSubmitted();
      toast({
        kind: "success",
        title: "Review submitted",
        message: "Our sentiment, emotion and fake-review models are analyzing it now.",
      });
    } catch {
      setServerError("Could not submit review. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-bold text-[#0f1111]">Overall rating</label>
        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHover(n)}
                  onClick={() => field.onChange(n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className="text-amz-star"
                >
                  <Star size={24} fill={n <= (hover || rating) ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} />
                </button>
              ))}
            </div>
          )}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-[#0f1111]" htmlFor="content">
          Write your review
        </label>
        <textarea
          id="content"
          rows={3}
          placeholder="What did you like or dislike? What should other shoppers know?"
          className="amz-input"
          {...register("content")}
        />
        {errors.content && (
          <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.content.message}</p>
        )}
      </div>

      {serverError && <p className="text-sm text-amz-red">{serverError}</p>}

      <button type="submit" disabled={isSubmitting} className="btn btn-orange font-medium">
        <Send size={14} /> {isSubmitting ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
