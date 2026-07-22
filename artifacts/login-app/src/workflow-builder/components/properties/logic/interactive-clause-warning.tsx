import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { RuleClause } from "@workspace/automation-platform";
import { collectKnownInteractiveOptionIds } from "../../../core/graph/upstream-interactive-nodes";
import { isInteractionSelectionIdField } from "../../../core/variables/interaction-variables";
import type { WorkflowDocument } from "../../../core/types";

export function useInteractiveClauseWarnings(
  document: WorkflowDocument | undefined,
  clause: RuleClause,
): string[] {
  const { t } = useTranslation("common");

  return useMemo(() => {
    if (!document || !isInteractionSelectionIdField(clause.field)) return [];
    const value = typeof clause.value === "string" ? clause.value.trim() : "";
    if (!value) return [];

    const knownIds = collectKnownInteractiveOptionIds(document);
    if (knownIds.has(value)) return [];

    return [
      t("workflowBuilder.validationIssues.unknownInteractiveSelection", {
        value,
        defaultValue: `Selection id "${value}" is not defined on any Buttons or List step.`,
      }),
    ];
  }, [clause.field, clause.value, document, t]);
}

export function InteractiveClauseWarning({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </div>
  );
}
