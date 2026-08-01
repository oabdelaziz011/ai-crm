import { memo, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CollapsibleSidebarSectionProps = {
  id: string;
  title: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
};

export const CollapsibleSidebarSection = memo(function CollapsibleSidebarSection({
  id,
  title,
  expanded,
  onToggle,
  children,
}: CollapsibleSidebarSectionProps) {
  return (
    <section className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`sidebar-section-${id}`}
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        {title}
        <ChevronDown
          className={cn("size-3.5 transition-transform duration-150", expanded && "rotate-180")}
        />
      </button>
      <div
        id={`sidebar-section-${id}`}
        className={cn(
          "grid transition-[grid-template-rows] duration-150 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">{children}</div>
        </div>
      </div>
    </section>
  );
});
