import { useTranslation } from "react-i18next";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ResolvedOperationsAction } from "@/lib/universal-operations/action-registry";

/** Always-visible quick actions — sourced exclusively from Action Registry (quickBar surface). */
export function OperationQuickActionBar({
  row,
  actions,
  executingId,
  onSelect,
}: {
  row: OperationsRow;
  actions: ResolvedOperationsAction[];
  executingId?: string | null;
  onSelect: (action: ResolvedOperationsAction, row: OperationsRow) => void;
}) {
  const { t } = useTranslation("common");

  if (!actions.length) {
    return (
      <div className="shrink-0 border-b border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
        {t("universalOperations.actions.empty")}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border/50 px-3 py-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const busy = executingId === action.id;
          const tooltip = action.disabledReasonKey ? t(action.disabledReasonKey) : action.title;
          const button = (
            <Button
              key={action.id}
              size="sm"
              variant={action.destructive ? "destructive" : "outline"}
              className={cn("h-8 gap-1.5 px-2.5 text-xs", !action.enabled && "opacity-60")}
              disabled={!action.enabled || busy}
              onClick={() => onSelect(action, row)}
            >
              <Icon className="size-3.5" />
              {action.title}
            </Button>
          );

          if (action.enabled) return button;

          return (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <span>{button}</span>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
