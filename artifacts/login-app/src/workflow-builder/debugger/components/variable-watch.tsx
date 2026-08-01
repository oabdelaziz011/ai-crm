import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { VariableWatchEntryViewModel } from "../selectors/debugger-ui-selectors";
import type { DebuggerListWindow } from "../utilities/debugger-list-window";
import { DebuggerVirtualList } from "./debugger-virtual-list";

type VariableWatchProps = {
  entries: VariableWatchEntryViewModel[];
  listWindow: DebuggerListWindow;
  rowHeight: number;
  selectedVariableKey: string | null;
  onSelectVariable: (variableKey: string | null) => void;
};

export const VariableWatch = memo(function VariableWatch({
  entries,
  listWindow,
  rowHeight,
  selectedVariableKey,
  onSelectVariable,
}: VariableWatchProps) {
  const { t } = useTranslation("common");

  const renderItem = useCallback(
    (entry: VariableWatchEntryViewModel) => (
      <li key={entry.key}>
        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
            selectedVariableKey === entry.key ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/40"
          }`}
          aria-pressed={selectedVariableKey === entry.key}
          aria-label={entry.key}
          onClick={() => onSelectVariable(entry.key)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{entry.key}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full text-[10px] uppercase">
                {entry.scope}
              </Badge>
              <Badge variant="outline" className="rounded-full text-[10px] uppercase">
                {entry.type}
              </Badge>
              {entry.changed ? (
                <Badge variant="secondary" className="rounded-full text-[10px] uppercase">
                  {t("workflowBuilder.debugger.variables.changed")}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="mt-1 truncate text-muted-foreground">{entry.value}</div>
          {entry.previousValue ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {entry.previousValue} → {entry.value}
            </div>
          ) : null}
        </button>
      </li>
    ),
    [onSelectVariable, selectedVariableKey, t],
  );

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("workflowBuilder.debugger.empty")}</p>;
  }

  return (
    <DebuggerVirtualList
      items={entries}
      listWindow={listWindow}
      rowHeight={rowHeight}
      renderItem={renderItem}
    />
  );
});
