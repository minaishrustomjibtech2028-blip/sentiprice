import { useState } from "react";
import { ImageOff } from "lucide-react";

import { mediaUrl } from "@/lib/api";
import { placeholderImage } from "@/lib/placeholder";

interface Props {
  imageUrl?: string | null;
  name: string;
  category: string;
  className?: string;
  /** shows a small "Generated image" chip when no real photo was uploaded */
  showPlaceholderBadge?: boolean;
}

export function ProductImage({ imageUrl, name, category, className = "", showPlaceholderBadge = false }: Props) {
  const resolved = mediaUrl(imageUrl);
  const [broken, setBroken] = useState(false);
  const isPlaceholder = !resolved || broken;
  const src = isPlaceholder ? placeholderImage(name, category) : resolved;

  return (
    <div className={`relative overflow-hidden bg-white ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-contain p-2 mix-blend-multiply"
          style={isPlaceholder ? { mixBlendMode: "normal", objectFit: "cover", padding: 0 } : undefined}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-amz-muted">
          <ImageOff size={28} />
        </div>
      )}
      {isPlaceholder && showPlaceholderBadge && (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Generated image
        </span>
      )}
    </div>
  );
}
