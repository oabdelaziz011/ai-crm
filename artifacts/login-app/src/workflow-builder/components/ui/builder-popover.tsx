import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type BuilderPopoverProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  align?: "start" | "center" | "end";
};

/**
 * Popover tuned for the workflow builder: non-modal so canvas/toolbar rerenders
 * do not steal focus and close the overlay immediately.
 */
export function BuilderPopover({
  open,
  onOpenChange,
  trigger,
  children,
  contentClassName,
  align = "start",
}: BuilderPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={contentClassName}
        data-builder-overlay-root=""
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("[data-builder-overlay-root]")) {
            event.preventDefault();
          }
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
