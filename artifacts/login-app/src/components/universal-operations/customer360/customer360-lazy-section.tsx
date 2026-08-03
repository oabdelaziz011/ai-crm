import { useEffect, useRef, useState, type ReactNode } from "react";

/** Lazy-mount section content when scrolled near viewport. */
export function LazySection({ children, minHeight = 80 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : minHeight }}>
      {visible ? children : <div className="animate-pulse rounded-2xl bg-muted/30" style={{ height: minHeight }} />}
    </div>
  );
}
