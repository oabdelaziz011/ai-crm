import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { summarizeValidationIssues } from "../../core/validation/validation-fix-actions";
import type { ValidationIssue } from "../../core/types";

type ValidationSummaryProps = {
  issues: ValidationIssue[];
  onOpenPanel: () => void;
};

export function ValidationSummary({ issues, onOpenPanel }: ValidationSummaryProps) {
  const { t } = useTranslation("common");
  const summary = summarizeValidationIssues(issues);

  const tone = summary.valid
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
    : summary.errors > 0
      ? "border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300";

  const Icon = summary.valid ? CheckCircle2 : summary.errors > 0 ? AlertCircle : AlertTriangle;

  const label = summary.valid
    ? t("workflowBuilder.validationSummary.valid")
    : summary.errors > 0 && summary.warnings > 0
      ? t("workflowBuilder.validationSummary.errorsAndWarnings", {
          errors: summary.errors,
          warnings: summary.warnings,
        })
      : summary.errors > 0
        ? t("workflowBuilder.validationSummary.errors", { count: summary.errors })
        : t("workflowBuilder.validationSummary.warnings", { count: summary.warnings });

  return (
    <button
      type="button"
      onClick={onOpenPanel}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${tone}`}
      aria-label={t("workflowBuilder.validationSummary.openPanel")}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
