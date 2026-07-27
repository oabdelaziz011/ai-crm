import { useEffect } from "react";
import { useAppShell } from "@/context/app-shell-context";
import { useFloatingAi } from "@/context/floating-ai-context";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function useFloatingAiKeyboard() {
  const { openCommandPalette, setCommandPaletteOpen } = useAppShell();
  const { openPanel, closePanel, isPanelVisible } = useAiPanel();
  const { setPendingFocusOnOpen, consumePendingFocus } = useFloatingAi();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.shiftKey) {
        event.preventDefault();
        if (isPanelVisible) {
          closePanel();
        } else {
          setPendingFocusOnOpen(true);
          openPanel();
          requestAnimationFrame(() => consumePendingFocus());
        }
        return;
      }

      if (event.key === "Escape" && isPanelVisible && !isEditable) {
        closePanel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    openCommandPalette,
    openPanel,
    closePanel,
    isPanelVisible,
    setPendingFocusOnOpen,
    consumePendingFocus,
  ]);

  return { isMac };
}
