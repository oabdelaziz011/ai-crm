import { cn } from "@/lib/utils";

/** Visual ghost / drop indicator while dragging. */
export function KanbanDragLayer({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  if (!active) return null;
  return (
    <div
      className={cn(
        "pointer-events-none rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-6 text-center text-[12px] font-medium text-primary/80 transition-opacity",
      )}
      aria-hidden
    >
      {label}
    </div>
  );
}
