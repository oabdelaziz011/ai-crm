import { useRef } from "react";
import { cn } from "@/lib/utils";
import { KanbanColumn } from "./kanban-column";
import { KanbanMetrics } from "./kanban-metrics";
import { KanbanToolbar } from "./kanban-toolbar";
import { useKanbanDnd } from "./use-kanban-dnd";
import type {
  EnterpriseKanbanLabels,
  KanbanCardModel,
  KanbanColumnModel,
  KanbanContextAction,
  KanbanMetric,
  KanbanPipelineOption,
  KanbanQuickAction,
} from "./types";

export function EnterpriseKanban<TData>({
  labels,
  metrics,
  pipelines,
  pipelineId,
  onPipelineChange,
  search,
  onSearchChange,
  onOpenFilters,
  onCustomizeColumns,
  onCreate,
  canCreate,
  filtersActive,
  columns,
  onMoveCard,
  onMoveSuccess,
  onCardOpen,
  onCreateInColumn,
  getQuickActions,
  getContextActions,
  className,
}: {
  labels: EnterpriseKanbanLabels;
  metrics: readonly KanbanMetric[];
  pipelines: readonly KanbanPipelineOption[];
  pipelineId: string | null;
  onPipelineChange: (pipelineId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  onCustomizeColumns?: () => void;
  onCreate: () => void;
  canCreate: boolean;
  filtersActive?: boolean;
  columns: readonly KanbanColumnModel<TData>[];
  onMoveCard: (input: { cardId: string; fromColumnId: string; toColumnId: string }) => void;
  onMoveSuccess?: () => void;
  onCardOpen: (card: KanbanCardModel<TData>) => void;
  onCreateInColumn?: (columnId: string) => void;
  getQuickActions?: (card: KanbanCardModel<TData>) => readonly KanbanQuickAction[];
  getContextActions?: (card: KanbanCardModel<TData>) => readonly KanbanContextAction[];
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { drag, onCardDragStart, onColumnDragOver, onColumnDrop, onDragEnd } = useKanbanDnd({
    onMove: onMoveCard,
    onMoveSuccess,
    scrollContainerRef: scrollRef,
  });

  return (
    <div
      className={cn("flex min-h-0 w-full flex-1 flex-col gap-4", className)}
      data-enterprise-kanban
    >
      <KanbanToolbar
        labels={labels}
        pipelines={pipelines}
        pipelineId={pipelineId}
        onPipelineChange={onPipelineChange}
        search={search}
        onSearchChange={onSearchChange}
        onOpenFilters={onOpenFilters}
        onCustomizeColumns={onCustomizeColumns}
        onCreate={onCreate}
        canCreate={canCreate}
        filtersActive={filtersActive}
        className="shrink-0"
      />

      {metrics.length > 0 ? (
        <KanbanMetrics metrics={metrics} ariaLabel={labels.metricsGroup} className="shrink-0" />
      ) : null}

      <div
        ref={scrollRef}
        className="flex min-h-[calc(100dvh-22rem)] flex-1 items-stretch gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
        role="list"
        aria-label={labels.pageTitle}
      >
        {columns.map((column) => (
          <div key={column.id} className="flex min-h-full shrink-0" role="listitem">
            <KanbanColumn
              column={column}
              labels={labels}
              canCreate={canCreate}
              onCreateInColumn={onCreateInColumn}
              isDropTarget={drag.isDragging && drag.overColumnId === column.id}
              draggingCardId={drag.cardId}
              onCardOpen={onCardOpen}
              onCardDragStart={onCardDragStart}
              onDragEnd={onDragEnd}
              onColumnDragOver={onColumnDragOver}
              onColumnDrop={onColumnDrop}
              getQuickActions={getQuickActions}
              getContextActions={getContextActions}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
