import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Braces, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BuilderPopover } from "../ui/builder-popover";
import type { WorkflowDocument } from "../../core/types";
import { listDocumentWorkflowVariables } from "../../core/variables/document-workflow-variable-provider";
import {
  listAllWorkflowVariables,
  listVariableProviders,
  type VariableCategory,
  type WorkflowVariable,
} from "../../core/variables/variable-provider-registry";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";

type VariablePickerProps = {
  onSelect: (variable: WorkflowVariable) => void;
  document?: WorkflowDocument;
  nodeId?: string;
};

export function VariablePicker({ onSelect, document, nodeId }: VariablePickerProps) {
  const { t } = useTranslation("common");
  const { variableCategoryLabel, variableFieldLabel } = useWorkflowBuilderI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allVariables = useMemo(() => {
    const variables = listAllWorkflowVariables();
    if (!document || !nodeId) return variables;
    const dynamic = listDocumentWorkflowVariables(document, nodeId);
    const seen = new Set(variables.map((entry) => entry.token));
    return [...variables, ...dynamic.filter((entry) => !seen.has(entry.token))];
  }, [document, nodeId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allVariables;
    return allVariables.filter(
      (variable) =>
        variable.label.toLowerCase().includes(normalized) ||
        variable.token.toLowerCase().includes(normalized) ||
        variable.category.includes(normalized),
    );
  }, [allVariables, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, WorkflowVariable[]>();
    for (const variable of filtered) {
      const key = variable.subgroup ? `${variable.category}:${variable.subgroup}` : variable.category;
      const list = groups.get(key) ?? [];
      list.push(variable);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [filtered]);

  const resolveSubgroupLabel = (variables: WorkflowVariable[], subgroup?: string) => {
    if (!subgroup) return null;
    const subgroupLabelKey = variables.find((entry) => entry.subgroupLabelKey)?.subgroupLabelKey;
    if (subgroupLabelKey) {
      return t(subgroupLabelKey, { defaultValue: subgroup.replace(/_/g, " ") });
    }
    return t(`workflowBuilder.variables.subgroups.${subgroup}`, {
      defaultValue: subgroup.replace(/_/g, " "),
    });
  };

  const resolveVariableLabel = (variable: WorkflowVariable) => {
    if (variable.labelKey) {
      return t(variable.labelKey, { defaultValue: variable.label });
    }
    return variableFieldLabel(
      variable.category,
      variable.id.split(".").slice(1).join(".") || variable.id,
      variable.label,
    );
  };

  return (
    <BuilderPopover
      open={open}
      onOpenChange={setOpen}
      align="start"
      contentClassName="w-80 rounded-2xl p-0"
      trigger={
        <Button type="button" variant="outline" size="sm" className="rounded-xl" aria-label={t("workflowBuilder.variables.insert")}>
          <Braces className="me-2 h-4 w-4" />
          {t("workflowBuilder.variables.insert")}
        </Button>
      }
    >
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
          {[...grouped].map(([groupKey, variables]) => {
            const [category, subgroup] = groupKey.includes(":")
              ? (groupKey.split(":") as [VariableCategory, string])
              : ([groupKey as VariableCategory, undefined] as const);
            return (
            <div key={groupKey} className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {variableCategoryLabel(category)}
              </p>
              {subgroup ? (
                <p className="px-2 pb-1 ps-4 text-[11px] font-medium text-muted-foreground">
                  {resolveSubgroupLabel(variables, subgroup)}
                </p>
              ) : null}
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
                  <span>{resolveVariableLabel(variable)}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                </button>
              ))}
            </div>
            );
          })}
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("workflowBuilder.variables.empty")}</p>
          ) : null}
        </div>
        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {listVariableProviders().length} {t("workflowBuilder.variables.providers")}
        </div>
    </BuilderPopover>
  );
}
