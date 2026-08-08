import { memo, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import { KanbanDragLayer } from "./kanban-drag-layer";
import { KanbanColumnEmptyInline } from "./kanban-empty-state";
import { useKanbanVirtualColumn } from "./use-kanban-virtual-column";
import type {
  EnterpriseKanbanLabels,
  KanbanCardModel,
  KanbanColumnModel,
  KanbanContextAction,
  KanbanQuickAction,
} from "./types";

export const KanbanColumn = memo(function KanbanColumn<TData>({
  column,
  labels,
  canCreate,
  onCreateInColumn,
  isDropTarget,
  draggingCardId,
  onCardOpen,
  onCardDragStart,
  onDragEnd,
  onColumnDragOver,
  onColumnDrop,
  getQuickActions,
  getContextActions,
}: {
  column: KanbanColumnModel<TData>;
  labels: EnterpriseKanbanLabels;
  canCreate: boolean;
  onCreateInColumn?: (columnId: string) => void;
  isDropTarget: boolean;
  draggingCardId: string | null;
  onCardOpen: (card: KanbanCardModel<TData>) => void;
  onCardDragStart: (cardId: string, columnId: string, event: DragEvent) => void;
  onDragEnd: () => void;
  onColumnDragOver: (columnId: string, event: DragEvent) => void;
  onColumnDrop: (columnId: string, event: DragEvent) => void;
  getQuickActions?: (card: KanbanCardModel<TData>) => readonly KanbanQuickAction[];
  getContextActions?: (card: KanbanCardModel<TData>) => readonly KanbanContextAction[];
}) {
  const { shouldVirtualize, totalHeight, visibleItems, onScroll } = useKanbanVirtualColumn(
    column.cards,
  );

  return (
    <section
      className={cn(
        "flex w-[min(100%,300px)] shrink-0 flex-col rounded-xl border border-border/60 bg-muted/15",
        "sm:w-[300px]",
        isDropTarget && "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20",
      )}
      aria-label={column.title}
      onDragOver={(event) => onColumnDragOver(column.id, event)}
      onDrop={(event) => onColumnDrop(column.id, event)}
    >
      <header className="shrink-0 border-b border-border/50 px-3.5 py-3">
        <div className="flex items-start gap-2">
          <span
            className={cn("mt-1 size-2.5 shrink-0 rounded-full", column.accentClassName ?? "bg-foreground/50")}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-semibold tracking-tight">{column.title}</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{column.countLabel}</p>
            <p className="text-[12px] font-medium tabular-nums text-foreground/80">
              {column.valueLabel}
            </p>
          </div>
        </div>
      </header>

      <div
        className="min-h-[160px] flex-1 space-y-2 overflow-y-auto p-2.5"
        style={{ maxHeight: "min(68vh, 720px)" }}
        onScroll={shouldVirtualize ? onScroll : undefined}
      >
        {isDropTarget ? <KanbanDragLayer active label={labels.dropHere} /> : null}

        {!column.cards.length ? (
          <KanbanColumnEmptyInline
            title={labels.emptyColumn}
            actionLabel={labels.addInColumn}
            canCreate={canCreate}
            onAction={onCreateInColumn ? () => onCreateInColumn(column.id) : undefined}
          />
        ) : shouldVirtualize ? (
          <div className="relative" style={{ height: totalHeight }}>
            {visibleItems.map(({ item: card, offsetTop }) => (
              <div
                key={card.id}
                className="absolute inset-x-0 px-0"
                style={{ transform: `translateY(${offsetTop}px)` }}
              >
                <KanbanCard
                  card={card}
                  moreLabel={labels.more}
                  isDragging={draggingCardId === card.id}
                  onOpen={() => onCardOpen(card)}
                  onDragStart={(event) => onCardDragStart(card.id, column.id, event)}
                  onDragEnd={onDragEnd}
                  quickActions={getQuickActions?.(card)}
                  contextActions={getContextActions?.(card)}
                />
              </div>
            ))}
          </div>
        ) : (
          column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              moreLabel={labels.more}
              isDragging={draggingCardId === card.id}
              onOpen={() => onCardOpen(card)}
              onDragStart={(event) => onCardDragStart(card.id, column.id, event)}
              onDragEnd={onDragEnd}
              quickActions={getQuickActions?.(card)}
              contextActions={getContextActions?.(card)}
            />
          ))
        )}
      </div>
    </section>
  );
});
