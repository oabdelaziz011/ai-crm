import { useEffect } from "react";

type AgentDeskKeyboardOptions = {
  enabled: boolean;
  onSearch: () => void;
  onEscape: () => void;
};

/** Presentation-only keyboard layer for Agent Desk (does not modify shared hooks). */
export function useAgentDeskKeyboard({ enabled, onSearch, onEscape }: AgentDeskKeyboardOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT"
        || target?.tagName === "TEXTAREA"
        || target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onSearch();
        return;
      }

      if (event.key === "Escape" && !isTyping) {
        onEscape();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onSearch, onEscape]);
}
