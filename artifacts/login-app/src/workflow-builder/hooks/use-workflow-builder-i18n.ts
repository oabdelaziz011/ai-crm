import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ValidationIssue } from "../core/types";
import type { VisualCategory } from "../core/visual/category-tokens";

export function useWorkflowBuilderI18n() {
  const { t } = useTranslation("common");

  const wb = useCallback(
    (key: string, options?: Record<string, unknown>) => t(`workflowBuilder.${key}`, options),
    [t],
  );

  const nodeText = useCallback(
    (nodeId: string, field: "displayName" | "description", fallback: string) => {
      const primary = t(`workflowBuilder.nodes.${nodeId}.${field}`, { defaultValue: "" });
      if (primary) return primary;
      const ai = t(`workflowBuilder.ai.nodes.${nodeId}.${field}`, { defaultValue: fallback });
      return ai || fallback;
    },
    [t],
  );

  const validationMessage = useCallback(
    (issue: ValidationIssue) => {
      const suffixKeys = [
        "missing-yes",
        "missing-no",
        "missing-rules",
        "missing-field",
        "missing-cases",
        "duplicate-case",
        "missing-default",
        "merge-paths",
      ] as const;

      for (const suffix of suffixKeys) {
        if (issue.id.endsWith(suffix)) {
          const translated = t(`workflowBuilder.validationIssues.${suffix}`, { defaultValue: "" });
          if (translated) return translated;
        }
      }

      if (issue.id.startsWith("isolated-")) {
        return t("workflowBuilder.validationIssues.isolated");
      }
      if (issue.id.startsWith("duplicate-start-")) {
        return t("workflowBuilder.validationIssues.duplicate-start");
      }
      if (issue.id.endsWith("-delay")) {
        return t("workflowBuilder.validationIssues.invalid-delay");
      }
      if (issue.id.endsWith("-buttons")) {
        return t("workflowBuilder.validationIssues.missing-buttons");
      }
      if (issue.id.endsWith("-rows")) {
        return t("workflowBuilder.validationIssues.missing-list-rows");
      }

      const direct = t(`workflowBuilder.validationIssues.${issue.id}`, { defaultValue: "" });
      if (direct) return direct;

      const ai = t(`workflowBuilder.ai.validationIssues.${issue.id}`, { defaultValue: "" });
      if (ai) return ai;

      if (issue.id.endsWith("-required") && issue.fieldLabelKey) {
        const fieldLabel = t(`workflowBuilder.validation.fieldLabels.${issue.fieldLabelKey}`, {
          defaultValue: issue.fieldLabelKey,
        });
        return t("workflowBuilder.validationIssues.requiredField", { field: fieldLabel });
      }

      if (issue.id.includes("-missing-case-") && issue.branchLabel) {
        return t("workflowBuilder.validationIssues.connectCaseBranch", { label: issue.branchLabel });
      }

      if (issue.id.endsWith("-too-many-outgoing") && issue.nodeType) {
        return t("workflowBuilder.validationIssues.tooManyOutgoing", {
          node: nodeText(issue.nodeType, "displayName", issue.nodeType),
        });
      }

      return issue.message;
    },
    [t, nodeText],
  );

  const lifecycleLabel = useCallback(
    (status: "draft" | "active" | "disabled" | "archived", hasUnpublishedDraft?: boolean) => {
      if (status === "active" && hasUnpublishedDraft) {
        return wb("lifecycle.publishedUnpublishedChanges");
      }
      if (status === "active") return wb("lifecycle.published");
      if (status === "archived" || status === "disabled") return wb("lifecycle.archived");
      return wb("lifecycle.draft");
    },
    [wb],
  );

  const categoryLabel = useCallback(
    (category: VisualCategory) => wb(`categories.${category}`),
    [wb],
  );

  const executionStatusLabel = useCallback(
    (status: "ready" | "running" | "completed" | "failed") => wb(`executionStatus.${status}`),
    [wb],
  );

  const branchLabel = useCallback(
    (key: string, fallback?: string) =>
      t(`workflowBuilder.branch.${key}`, { defaultValue: fallback ?? key }),
    [t],
  );

  const variableCategoryLabel = useCallback(
    (category: string) => t(`workflowBuilder.variables.categories.${category}`, { defaultValue: category }),
    [t],
  );

  const variableFieldLabel = useCallback(
    (category: string, field: string, fallback: string) =>
      t(`workflowBuilder.variables.fields.${category}.${field}`, { defaultValue: fallback }),
    [t],
  );

  const ai = useCallback(
    (key: string, options?: Record<string, unknown>) => t(`workflowBuilder.ai.${key}`, options),
    [t],
  );

  return {
    t,
    wb,
    ai,
    nodeText,
    validationMessage,
    lifecycleLabel,
    categoryLabel,
    executionStatusLabel,
    branchLabel,
    variableCategoryLabel,
    variableFieldLabel,
    inputSource: (source: string) => ai(`inputSources.${source}`),
    outputMode: (mode: string) => ai(`outputModes.${mode}`),
    decisionMode: (mode: string) => ai(`decisionModes.${mode}`),
    summaryPreset: (preset: string, fallback: string) =>
      t(`workflowBuilder.ai.summaryPresets.${preset}`, { defaultValue: fallback }),
  };
}
