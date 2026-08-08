import { useEffect } from "react";
import { useLocation } from "wouter";
import { useWorkspacePlatformOptional } from "@/context/workspace-platform-context";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function useWorkspaceKeyboard() {
  const platform = useWorkspacePlatformOptional();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!platform) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isEditable && event.key !== "Escape") return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        platform.openCommand();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        platform.openPersonalization();
        return;
      }

      if (event.key === "/" && !isEditable) {
        event.preventDefault();
        platform.openSearch();
        return;
      }

      if (event.key === "Escape") {
        platform.closeCommand();
        platform.closeSearch();
        platform.closeNotifications();
        platform.closePersonalization();
        return;
      }

      if (event.key === "g" && !isEditable) {
        const handler = (e: KeyboardEvent) => {
          // Nest-relative paths — WorkspacePlatformShell lives under /dashboard/operations
          if (e.key.toLowerCase() === "o") {
            e.preventDefault();
            setLocation("/queue");
          }
          if (e.key.toLowerCase() === "h") {
            e.preventDefault();
            setLocation("/hub");
          }
          if (e.key.toLowerCase() === "t") {
            e.preventDefault();
            setLocation("/timeline");
          }
          window.removeEventListener("keydown", handler);
        };
        window.addEventListener("keydown", handler, { once: true });
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [platform, setLocation]);

  return { isMac };
}
