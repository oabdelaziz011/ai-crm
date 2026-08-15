import { memo, useEffect } from "react";
import { useLocation } from "wouter";
import { useHasPermission } from "@/hooks/use-rbac";
import { useAuth } from "@/context/auth-context";
import { useCompanyCapability } from "@/hooks/billing/use-company-feature";
import { useAiChatFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";
import { useFloatingAi } from "@/context/floating-ai-context";
import { useAppShell } from "@/context/app-shell-context";
import { sectionIdFromNestedPath } from "@/config/dashboard-route-registry";
import { isAiDashboardSection } from "@/lib/bundle/is-ai-dashboard-route";
import {
  FLOATING_AI_OPEN_EVENT,
  type FloatingAiOpenDetail,
} from "@/lib/floating-ai/open-assistant";
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
  const { isSuperAdmin } = useAuth();
  const canViewAiPermission = useHasPermission("ai_chat.view");
  const { enabled: aiAssistantEntitled } = useCompanyCapability("ai_assistant", {
    enabled: !isSuperAdmin,
  });
  const { isEnabled: aiChatFlagEnabled, isLoading: aiChatFlagLoading } = useAiChatFeatureEnabled();
  const canViewAi =
    canViewAiPermission
    && (isSuperAdmin || (aiAssistantEntitled && !aiChatFlagLoading && aiChatFlagEnabled));
  const { openPanel, isPanelVisible, closePanel } = useAiPanel();
  const {
    setPendingFocusOnOpen,
    consumePendingFocus,
    setPendingComposerDraft,
  } = useFloatingAi();
  const { openCommandPalette } = useAppShell();
  const [location] = useLocation();
  const sectionId = sectionIdFromNestedPath(location);

  useEffect(() => {
    if (!canViewAi) return;
    if (isAiDashboardSection(sectionId)) {
      onActivate();
      preloadFloatingAiAssistant();
    }
  }, [sectionId, onActivate, canViewAi]);

  useEffect(() => {
    const openAssistant = (detail?: FloatingAiOpenDetail) => {
      if (!canViewAi) return;
      onActivate();
      preloadFloatingAiAssistant();
      if (detail?.draft) setPendingComposerDraft(detail.draft);
      setPendingFocusOnOpen(true);
      openPanel();
      requestAnimationFrame(() => consumePendingFocus());
    };

    const onOpenRequest = (event: Event) => {
      const detail = (event as CustomEvent<FloatingAiOpenDetail>).detail;
      openAssistant(detail);
    };

    window.addEventListener(FLOATING_AI_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(FLOATING_AI_OPEN_EVENT, onOpenRequest);
  }, [
    canViewAi,
    consumePendingFocus,
    onActivate,
    openPanel,
    setPendingComposerDraft,
    setPendingFocusOnOpen,
  ]);

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
