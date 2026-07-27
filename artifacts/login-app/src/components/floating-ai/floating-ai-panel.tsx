import { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";
import { useIsMobile, useIsTablet } from "@/hooks/floating-ai/use-floating-ai-viewport";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { FloatingAiPanelContent } from "./floating-ai-panel-content";
import { AI_PANEL_SIZE_DIMENSIONS } from "@/lib/floating-ai/types";

export const FloatingAiPanel = memo(function FloatingAiPanel() {
  const { isPanelVisible, panelSize, closePanel } = useAiPanel();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPanelVisible || isMobile || isTablet) return;
    const node = panelRef.current;
    if (!node) return;

    const focusable = node.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    node.addEventListener("keydown", trap);
    return () => node.removeEventListener("keydown", trap);
  }, [isPanelVisible, isMobile, isTablet]);

  if (!isPanelVisible) return null;

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(open) => !open && closePanel()}>
        <DrawerContent className="max-h-[92vh]">
          <div className="flex max-h-[calc(92vh-2rem)] min-h-[50vh] flex-col overflow-hidden">
            <FloatingAiPanelContent layout="drawer" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (isTablet) {
    return (
      <Sheet open onOpenChange={(open) => !open && closePanel()}>
        <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-lg">
          <div className="flex h-full flex-col overflow-hidden">
            <FloatingAiPanelContent layout="sheet" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const dimensions =
    panelSize === "fullscreen"
      ? { width: "min(560px, calc(100vw - 2rem))", height: "min(720px, calc(100vh - 2rem))" }
      : {
          width: AI_PANEL_SIZE_DIMENSIONS[panelSize as keyof typeof AI_PANEL_SIZE_DIMENSIONS].width,
          height: AI_PANEL_SIZE_DIMENSIONS[panelSize as keyof typeof AI_PANEL_SIZE_DIMENSIONS].height,
        };

  return createPortal(
    <div
      ref={panelRef}
      className={cn(
        "fixed z-[91] flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40 transition-[opacity,transform] duration-250 ease-out animate-in fade-in-0 zoom-in-95",
        panelSize === "fullscreen" && "inset-4",
      )}
      style={
        panelSize === "fullscreen"
          ? undefined
          : {
              width: dimensions.width,
              height: dimensions.height,
              right: 24,
              bottom: 88,
            }
      }
    >
      <FloatingAiPanelContent layout="floating" />
    </div>,
    document.body,
  );
});
