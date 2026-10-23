import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

export const PRODUCT_PHOTO_LIMIT = 5;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Square stage that crossfades a product's photos. Clicks pass through to the parent card. */
export function ProductImageStage({
  images,
  alt,
  className,
}: {
  images: readonly string[];
  alt: string;
  className?: string;
}) {
  const photos = images.filter((url) => url.trim()).slice(0, PRODUCT_PHOTO_LIMIT);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const photoKey = photos.join("|");

  useEffect(() => {
    setIndex(0);
  }, [photoKey]);

  useEffect(() => {
    if (paused || photos.length < 2 || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % photos.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [paused, photos.length, photoKey]);

  if (photos.length === 0) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <Package className="size-8" aria-hidden />
      </div>
    );
  }

  const visible = photos[index] ?? photos[0];

  return (
    <div
      className={cn("relative overflow-hidden bg-muted", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {photos.map((src) => (
        <img
          key={src}
          src={src}
          alt={src === visible ? alt : ""}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
            src === visible ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      {photos.length > 1 ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
          {photos.map((src, photoIndex) => (
            <span
              key={src}
              className={cn(
                "h-1.5 rounded-full bg-white shadow-sm",
                photoIndex === index ? "w-4" : "w-1.5 opacity-70",
              )}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}
