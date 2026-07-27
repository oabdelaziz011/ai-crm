import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "valueor.floating-ai.button-position";

export type FloatingPosition = {
  x: number;
  y: number;
};

const BUTTON_SIZE = 56;
const VIEWPORT_MARGIN = 16;

function readStoredPosition(): FloatingPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FloatingPosition;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function defaultPosition(): FloatingPosition {
  if (typeof window === "undefined") {
    return { x: 24, y: 24 };
  }
  return {
    x: window.innerWidth - BUTTON_SIZE - VIEWPORT_MARGIN,
    y: window.innerHeight - BUTTON_SIZE - VIEWPORT_MARGIN,
  };
}

function clampPosition(position: FloatingPosition): FloatingPosition {
  if (typeof window === "undefined") return position;
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - BUTTON_SIZE - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - BUTTON_SIZE - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(position.x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(position.y, VIEWPORT_MARGIN), maxY),
  };
}

export function useFloatingPosition() {
  const [position, setPosition] = useState<FloatingPosition>(() =>
    clampPosition(readStoredPosition() ?? defaultPosition()),
  );
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
      /* ignore */
    }
  }, [position]);

  useEffect(() => {
    const onResize = () => setPosition((prev) => clampPosition(prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [position.x, position.y],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    setPosition(
      clampPosition({
        x: drag.originX + dx,
        y: drag.originY + dy,
      }),
    );
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const wasDragged = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag) return false;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    return Math.abs(dx) + Math.abs(dy) >= 4;
  }, []);

  return {
    position,
    buttonSize: BUTTON_SIZE,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    wasDragged,
  };
}
