import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SIDEBAR_TRANSITION_MS = 250;

const SIDEBAR_TRANSITION = "duration-[250ms] ease-in-out";

export type CollapsibleSidebarEdge = "leading" | "trailing";

type CollapsibleSidebarProps = {
  panelId: string;
  widthPx: number;
  collapsed: boolean;
  onToggle: () => void;
  collapseLabel: string;
  expandLabel: string;
  edge: CollapsibleSidebarEdge;
  children: ReactNode;
};

export function CollapsibleSidebar({
  panelId,
  widthPx,
  collapsed,
  onToggle,
  collapseLabel,
  expandLabel,
  edge,
  children,
}: CollapsibleSidebarProps) {
  const isLeading = edge === "leading";

  const toggleButtonClassName =
    "pointer-events-auto h-9 w-9 rounded-full border-border/70 bg-background/95 shadow-lg backdrop-blur transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div
      className={cn(
        "relative h-full min-h-0 shrink-0 overflow-visible transition-[width]",
        SIDEBAR_TRANSITION,
      )}
      style={{ width: collapsed ? 0 : widthPx }}
    >
      <div
        className={cn(
          "h-full overflow-hidden transition-[width,opacity]",
          SIDEBAR_TRANSITION,
          collapsed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        style={{ width: collapsed ? 0 : widthPx }}
        aria-hidden={collapsed}
      >
        <div className="h-full" style={{ width: widthPx }}>
          {children}
        </div>
      </div>

      {!collapsed ? (
        <div
          className={cn(
            "pointer-events-none absolute top-4 z-50",
            isLeading
              ? "end-0 translate-x-1/2 rtl:-translate-x-1/2"
              : "start-0 -translate-x-1/2 rtl:translate-x-1/2",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={toggleButtonClassName}
            onClick={onToggle}
            aria-expanded
            aria-controls={panelId}
            aria-label={collapseLabel}
          >
            {isLeading ? (
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            )}
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "pointer-events-none absolute top-4 z-50",
            isLeading ? "start-0" : "end-0",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={toggleButtonClassName}
            onClick={onToggle}
            aria-expanded={false}
            aria-controls={panelId}
            aria-label={expandLabel}
          >
            {isLeading ? (
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
