import { memo, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KanbanCardModel, KanbanContextAction, KanbanQuickAction } from "./types";

const SCORE_TONE: Record<NonNullable<KanbanCardModel["scoreTone"]>, string> = {
  cold: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  warm: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  hot: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  urgent: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const SCORE_DOT: Record<NonNullable<KanbanCardModel["scoreTone"]>, string> = {
  cold: "bg-sky-500",
  warm: "bg-amber-500",
  hot: "bg-orange-500",
  urgent: "bg-red-500",
};

export const KanbanCard = memo(function KanbanCard<TData>({
  card,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
  quickActions,
  contextActions,
  moreLabel,
  metaRows,
}: {
  card: KanbanCardModel<TData>;
  onOpen: () => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
  quickActions?: readonly KanbanQuickAction[];
  contextActions?: readonly KanbanContextAction[];
  moreLabel: string;
  metaRows?: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  const hasMoreMenu = Boolean(contextActions?.length);

  const body = (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={card.title}
      className={cn(
        "group relative w-full rounded-xl border border-border/60 bg-background p-3 text-start shadow-sm transition",
        "hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-tight">{card.title}</div>
          {card.subtitle ? (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{card.subtitle}</div>
          ) : null}
        </div>
        {card.scoreLabel && card.scoreTone ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
              SCORE_TONE[card.scoreTone],
            )}
          >
            <span className={cn("size-1.5 rounded-full", SCORE_DOT[card.scoreTone])} aria-hidden />
            {card.scoreLabel}
          </span>
        ) : null}
      </div>

      {card.valueLabel ? (
        <div className="mt-2 text-[13px] font-semibold tabular-nums">{card.valueLabel}</div>
      ) : null}

      {metaRows}

      <div className="mt-2 grid gap-1 text-[12px] text-muted-foreground">
        {card.ownerLabel ? <div className="truncate">{card.ownerLabel}</div> : null}
        {card.nextActivityLabel ? <div className="truncate">{card.nextActivityLabel}</div> : null}
        {card.lastActivityLabel ? <div className="truncate">{card.lastActivityLabel}</div> : null}
        {card.sourceLabel ? <div className="truncate">{card.sourceLabel}</div> : null}
      </div>

      {card.counters?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.counters
            .filter((counter) => counter.count > 0)
            .map((counter) => (
              <span
                key={counter.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={counter.label}
              >
                {counter.icon}
                <span className="tabular-nums">{counter.count}</span>
              </span>
            ))}
        </div>
      ) : null}

      {(card.winProbabilityLabel || card.aiSummary || card.nextBestAction) && (
        <div className="mt-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px]">
          {card.winProbabilityLabel ? (
            <div className="font-semibold">{card.winProbabilityLabel}</div>
          ) : null}
          {card.aiSummary ? (
            <p className="mt-0.5 line-clamp-2 text-muted-foreground">{card.aiSummary}</p>
          ) : null}
          {card.nextBestAction ? (
            <p className="mt-1 font-medium">{card.nextBestAction}</p>
          ) : null}
          {card.suggestedFollowUp ? (
            <p className="mt-0.5 text-muted-foreground">{card.suggestedFollowUp}</p>
          ) : null}
        </div>
      )}

      {quickActions?.length || hasMoreMenu ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1 rounded-lg border border-border/60 bg-background/95 p-1 opacity-0 shadow-sm backdrop-blur transition",
            "group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {(quickActions ?? []).map((action) => {
            const tip = action.title ?? action.label;
            return (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 max-w-full truncate px-2 text-[11px]"
                disabled={action.disabled}
                title={tip}
                aria-label={tip}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onSelect();
                }}
              >
                {action.label}
              </Button>
            );
          })}
          {hasMoreMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  title={moreLabel}
                  aria-label={moreLabel}
                  onClick={(event) => event.stopPropagation()}
                >
                  {moreLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                {contextActions!.map((action) => (
                  <DropdownMenuItem
                    key={action.id}
                    disabled={action.disabled}
                    className={action.destructive ? "text-destructive" : undefined}
                    title={action.label}
                    onSelect={(event) => {
                      event.preventDefault();
                      action.onSelect();
                    }}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!contextActions?.length) return body;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full">{body}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px]">
        {contextActions.map((action, index) => (
          <div key={action.id}>
            {action.destructive && index > 0 ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              disabled={action.disabled}
              className={action.destructive ? "text-destructive" : undefined}
              onSelect={action.onSelect}
            >
              {action.label}
            </ContextMenuItem>
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
});
