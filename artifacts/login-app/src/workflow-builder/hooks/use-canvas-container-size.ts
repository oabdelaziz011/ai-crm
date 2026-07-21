import { useEffect, useRef, useState } from "react";

export type CanvasContainerSize = {
  width: number;
  height: number;
};

export function useCanvasContainerSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<CanvasContainerSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const readSize = () => {
      const { width, height } = element.getBoundingClientRect();
      const nextWidth = Math.floor(width);
      const nextHeight = Math.floor(height);
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    readSize();

    const observer = new ResizeObserver(() => {
      readSize();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return {
    containerRef,
    size,
    isReady: size.width > 0 && size.height > 0,
  };
}
