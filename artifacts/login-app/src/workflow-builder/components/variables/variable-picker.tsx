import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Braces, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listAllWorkflowVariables,
  listVariableProviders,
  type VariableCategory,
  type WorkflowVariable,
} from "../../core/variables/variable-provider-registry";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";

type VariablePickerProps = {
  onSelect: (variable: WorkflowVariable) => void;
};

export function VariablePicker({ onSelect }: VariablePickerProps) {
  const { t } = useTranslation("common");
  const { variableCategoryLabel, variableFieldLabel } = useWorkflowBuilderI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const variables = listAllWorkflowVariables();
    if (!normalized) return variables;
    return variables.filter(
      (variable) =>
        variable.label.toLowerCase().includes(normalized) ||
        variable.token.toLowerCase().includes(normalized) ||
        variable.category.includes(normalized),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const groups = new Map<VariableCategory, WorkflowVariable[]>();
    for (const variable of filtered) {
      const list = groups.get(variable.category) ?? [];
      list.push(variable);
      groups.set(variable.category, list);
    }
    return groups;
  }, [filtered]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" aria-label={t("workflowBuilder.variables.insert")}>
          <Braces className="me-2 h-4 w-4" />
          {t("workflowBuilder.variables.insert")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-2xl p-0">
        <div className="border-b border-border/60 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("workflowBuilder.variables.search")}
              className="rounded-xl ps-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {[...grouped.entries()].map(([category, variables]) => (
            <div key={category} className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {variableCategoryLabel(category)}
              </p>
              {variables.map((variable) => (
                <button
                  key={variable.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-start text-sm transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={() => {
                    onSelect(variable);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>{variableFieldLabel(variable.category, variable.id.split(".").slice(1).join(".") || variable.id, variable.label)}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("workflowBuilder.variables.empty")}</p>
          ) : null}
        </div>
        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {listVariableProviders().length} {t("workflowBuilder.variables.providers")}
        </div>
      </PopoverContent>
    </Popover>
  );
}
