import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "conversation-intelligence-panel-width";
export const INTELLIGENCE_PANEL_MIN = 320;
export const INTELLIGENCE_PANEL_MAX = 520;
export const INTELLIGENCE_PANEL_DEFAULT = 360;

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INTELLIGENCE_PANEL_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return INTELLIGENCE_PANEL_DEFAULT;
    return Math.min(INTELLIGENCE_PANEL_MAX, Math.max(INTELLIGENCE_PANEL_MIN, parsed));
  } catch {
    return INTELLIGENCE_PANEL_DEFAULT;
  }
}

export function useIntelligencePanelWidth() {
  const [width, setWidth] = useState(loadWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  /**
   * `trailing` — drag the end edge (CRM on the left of the shell).
   * `leading` — drag the start edge (legacy right-docked panel).
   */
  const startResize = useCallback((clientX: number, panelRect: DOMRect, edge: "trailing" | "leading" = "trailing") => {
    setIsResizing(true);

    const onMove = (event: PointerEvent) => {
      const next =
        edge === "trailing" ? event.clientX - panelRect.left : panelRect.right - event.clientX;
      setWidth(Math.min(INTELLIGENCE_PANEL_MAX, Math.max(INTELLIGENCE_PANEL_MIN, next)));
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return { width, isResizing, startResize };
}
