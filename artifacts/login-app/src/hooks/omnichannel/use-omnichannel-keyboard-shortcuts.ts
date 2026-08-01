import { useEffect } from "react";

type OmnichannelKeyboardShortcutsOptions = {
  enabled: boolean;
  onReply: () => void;
  onAssign: () => void;
  onClose: () => void;
  onSearch: () => void;
};

export function useOmnichannelKeyboardShortcuts({
  enabled,
  onReply,
  onAssign,
  onClose,
  onSearch,
}: OmnichannelKeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT"
        || target?.tagName === "TEXTAREA"
        || target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        onSearch();
        return;
      }

      if (!event.altKey || isTyping) return;

      switch (event.key.toLowerCase()) {
        case "r":
          event.preventDefault();
          onReply();
          break;
        case "a":
          event.preventDefault();
          onAssign();
          break;
        case "c":
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onReply, onAssign, onClose, onSearch]);
}
