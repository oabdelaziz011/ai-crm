import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppShell } from "@/context/app-shell-context";
import type { AiPanelSize } from "@/lib/floating-ai/types";

const PANEL_SIZE_KEY = "valueor.floating-ai.panel-size";
const PANEL_MINIMIZED_KEY = "valueor.floating-ai.panel-minimized";

function readPanelSize(): AiPanelSize {
  try {
    const value = localStorage.getItem(PANEL_SIZE_KEY);
    if (value === "small" || value === "medium" || value === "large" || value === "fullscreen") {
      return value;
    }
  } catch {
    /* ignore */
  }
  return "medium";
}

function readMinimized(): boolean {
  try {
    return localStorage.getItem(PANEL_MINIMIZED_KEY) === "true";
  } catch {
    return false;
  }
}

export function useAiPanel() {
  const { copilotOpen, setCopilotOpen, toggleCopilot } = useAppShell();
  const [panelSize, setPanelSizeState] = useState<AiPanelSize>(readPanelSize);
  const [minimized, setMinimizedState] = useState(readMinimized);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_SIZE_KEY, panelSize);
    } catch {
      /* ignore */
    }
  }, [panelSize]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_MINIMIZED_KEY, String(minimized));
    } catch {
      /* ignore */
    }
  }, [minimized]);

  const openPanel = useCallback(() => {
    setMinimizedState(false);
    setCopilotOpen(true);
  }, [setCopilotOpen]);

  const closePanel = useCallback(() => {
    setCopilotOpen(false);
  }, [setCopilotOpen]);

  const minimizePanel = useCallback(() => {
    setMinimizedState(true);
    setCopilotOpen(false);
  }, [setCopilotOpen]);

  const togglePanel = useCallback(() => {
    if (minimized) {
      setMinimizedState(false);
      setCopilotOpen(true);
      return;
    }
    toggleCopilot();
  }, [minimized, setCopilotOpen, toggleCopilot]);

  const setPanelSize = useCallback((size: AiPanelSize) => {
    setPanelSizeState(size);
  }, []);

  const cyclePanelSize = useCallback(() => {
    setPanelSizeState((prev) => {
      const order: AiPanelSize[] = ["small", "medium", "large", "fullscreen"];
      const index = order.indexOf(prev);
      return order[(index + 1) % order.length];
    });
  }, []);

  const isPanelVisible = useMemo(() => copilotOpen && !minimized, [copilotOpen, minimized]);

  return {
    isOpen: copilotOpen,
    isPanelVisible,
    minimized,
    panelSize,
    openPanel,
    closePanel,
    minimizePanel,
    togglePanel,
    setPanelSize,
    cyclePanelSize,
    setMinimized: setMinimizedState,
  };
}
