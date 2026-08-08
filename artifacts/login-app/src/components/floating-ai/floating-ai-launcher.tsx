import { memo, useEffect } from "react";
import { useLocation } from "wouter";
import { useHasPermission } from "@/hooks/use-rbac";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";
import { useFloatingAi } from "@/context/floating-ai-context";
import { useAppShell } from "@/context/app-shell-context";
import { sectionIdFromNestedPath } from "@/config/dashboard-route-registry";
import { isAiDashboardSection } from "@/lib/bundle/is-ai-dashboard-route";
import { preloadFloatingAiAssistant } from "./floating-ai-assistant";

type FloatingAiLauncherProps = {
  onActivate: () => void;
};

/**
 * Keyboard shortcuts + route-based AI preload.
 * The floating FAB is removed — AI opens from the sticky header.
 */
export const FloatingAiLauncher = memo(function FloatingAiLauncher({
  onActivate,
}: FloatingAiLauncherProps) {
  const canViewAi = useHasPermission("ai_chat.view");
  const { openPanel, isPanelVisible, closePanel } = useAiPanel();
  const { setPendingFocusOnOpen, consumePendingFocus } = useFloatingAi();
  const { openCommandPalette } = useAppShell();
  const [location] = useLocation();
  const sectionId = sectionIdFromNestedPath(location);

  useEffect(() => {
    if (isAiDashboardSection(sectionId)) {
      onActivate();
      preloadFloatingAiAssistant();
    }
  }, [sectionId, onActivate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT"
        || target?.tagName === "TEXTAREA"
        || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.shiftKey) {
        if (!canViewAi) return;
        event.preventDefault();
        onActivate();
        preloadFloatingAiAssistant();
        if (isPanelVisible) {
          closePanel();
        } else {
          setPendingFocusOnOpen(true);
          openPanel();
          requestAnimationFrame(() => consumePendingFocus());
        }
      }

      if (event.key === "Escape" && isPanelVisible && !isEditable) {
        closePanel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canViewAi,
    closePanel,
    consumePendingFocus,
    isPanelVisible,
    onActivate,
    openCommandPalette,
    openPanel,
    setPendingFocusOnOpen,
  ]);

  return null;
});
