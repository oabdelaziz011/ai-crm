import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WebsiteGallery } from "@/lib/website/website-model";

export function WebsiteGalleryReel({
  gallery,
  placeholder = false,
}: {
  gallery: WebsiteGallery;
  placeholder?: boolean;
}) {
  const { t } = useTranslation("common");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = gallery.slides;
  const count = slides.length;

  useEffect(() => {
    setIndex(0);
  }, [gallery.direction, count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [count, paused, gallery.direction]);

  if (count === 0) {
    if (!placeholder) return null;
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl bg-muted/50 px-6 text-center text-sm text-muted-foreground">
        {t("websiteBuilder.builder.galleryEmpty")}
      </div>
    );
  }

  const step = (delta: number) => setIndex((current) => (current + delta + count) % count);

  const current = slides[index] ?? slides[0];

  return (
    <section
      className="relative h-72 overflow-hidden rounded-2xl bg-muted sm:h-96"
      aria-roledescription="carousel"
      aria-label={t("websiteBuilder.section.gallery")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((slide, slideIndex) => {
        const shift = gallery.direction === "left" ? (slideIndex - index) * 100 : (index - slideIndex) * 100;
        return (
          <img
            key={slide.id}
            src={slide.url}
            alt={slide.alt || t("websiteBuilder.section.gallery")}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${shift}%)`, objectPosition: gallery.position ?? "center" }}
          />
        );
      })}
      {current?.alt ? (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-10 pt-12 text-sm text-white">
          {current.alt}
        </p>
      ) : null}
      {count > 1 ? (
        <>
          <button
            type="button"
            className="absolute start-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
            onClick={() => step(gallery.direction === "left" ? -1 : 1)}
            aria-label={t("websiteBuilder.builder.galleryPrev")}
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </button>
          <button
            type="button"
            className="absolute end-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
            onClick={() => step(gallery.direction === "left" ? 1 : -1)}
            aria-label={t("websiteBuilder.builder.galleryNext")}
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                className={slideIndex === index ? "h-1.5 w-6 rounded-full bg-white" : "size-1.5 rounded-full bg-white/70"}
                aria-label={`${slideIndex + 1}`}
                aria-current={slideIndex === index}
                onClick={() => setIndex(slideIndex)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
