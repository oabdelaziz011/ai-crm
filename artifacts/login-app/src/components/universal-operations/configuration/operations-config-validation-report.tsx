import type { OperationsConfigValidationReport } from "@workspace/universal-operations-engine";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function OperationsConfigValidationReportPanel({ report }: { report: OperationsConfigValidationReport | null }) {
  const { t } = useTranslation("common");
  if (!report) return null;

  return (
    <div
      className={
        report.valid
          ? "rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
          : "rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      }
      role="status"
    >
      <div className="flex items-start gap-2">
        {report.valid ? (
          <CheckCircle2 className="mt-0.5 size-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertCircle className="mt-0.5 size-4 text-amber-600 dark:text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {report.valid
              ? t("universalOperations.configuration.validationPassed")
              : t("universalOperations.configuration.validationFailed")}
          </p>
          {!report.valid ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("universalOperations.configuration.validationFixHint")}</p>
          ) : null}
          {report.issues.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {report.issues.map((issue, index) => (
                <li key={`${issue.path}-${index}`} className="text-xs text-muted-foreground">
                  <span className={issue.severity === "error" ? "font-medium text-red-600 dark:text-red-400" : "font-medium text-amber-700 dark:text-amber-400"}>
                    {issue.severity === "error"
                      ? t("universalOperations.configuration.validationError")
                      : t("universalOperations.configuration.validationWarning")}
                  </span>
                  {" — "}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
