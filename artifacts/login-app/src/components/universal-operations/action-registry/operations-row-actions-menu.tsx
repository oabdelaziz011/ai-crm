import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ActionGroupSection, ResolvedOperationsAction } from "@/lib/universal-operations/action-registry";

export type OperationsRowActionsMenuProps = {
  row: OperationsRow;
  groups: ActionGroupSection[];
  executingId?: string | null;
  onSelect: (action: ResolvedOperationsAction, row: OperationsRow) => void;
};

function ActionMenuItem({
  action,
  busy,
  onSelect,
}: {
  action: ResolvedOperationsAction;
  busy: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("common");
  const Icon = action.icon;
  const tooltip = action.disabledReasonKey ? t(action.disabledReasonKey) : undefined;

  const item = (
    <DropdownMenuItem
      disabled={!action.enabled || busy}
      onSelect={(event) => {
        if (!action.enabled || busy) {
          event.preventDefault();
          return;
        }
        onSelect();
      }}
      className={cn(
        "gap-2",
        action.destructive && "text-destructive focus:text-destructive",
        !action.enabled && "opacity-60",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">{t(action.titleKey, { defaultValue: action.title })}</span>
      {action.comingSoon && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("universalOperations.actions.comingSoonShort")}
        </span>
      )}
    </DropdownMenuItem>
  );

  if (!tooltip || action.enabled) return item;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{item}</div>
      </TooltipTrigger>
      <TooltipContent side="left">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Pure presentation — actions come exclusively from the Action Registry. */
export function OperationsRowActionsMenu({
  row,
  groups,
  executingId,
  onSelect,
}: OperationsRowActionsMenuProps) {
  const { t } = useTranslation("common");

  return (
    <TooltipProvider delayDuration={200}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("universalOperations.grid.rowActions")}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {groups.length === 0 ? (
            <DropdownMenuItem disabled>{t("universalOperations.actions.empty")}</DropdownMenuItem>
          ) : (
            groups.map((section, index) => (
              <div key={section.group}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t(section.labelKey)}
                </DropdownMenuLabel>
                {section.actions.map((action) => (
                  <ActionMenuItem
                    key={action.id}
                    action={action}
                    busy={executingId === action.id}
                    onSelect={() => onSelect(action, row)}
                  />
                ))}
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
