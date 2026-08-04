import type { OperationsConfigValidationReport } from "@workspace/universal-operations-engine";
import { useTranslation } from "react-i18next";

export function OperationsConfigValidationReportPanel({ report }: { report: OperationsConfigValidationReport | null }) {
  const { t } = useTranslation("common");
  if (!report) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      <p className="text-sm font-semibold">
        {report.valid
          ? t("universalOperations.configuration.validationPassed")
          : t("universalOperations.configuration.validationFailed")}
      </p>
      <ul className="mt-2 space-y-1">
        {report.issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`} className="text-xs text-muted-foreground">
            <span className={issue.severity === "error" ? "text-red-500" : "text-amber-500"}>
              [{issue.severity}]
            </span>{" "}
            {issue.path}: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
