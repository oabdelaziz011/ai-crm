import type { AiEmployeeVersionComparison } from "@/lib/ai-employees/types";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

type VersionCompareViewProps = {
  comparison: AiEmployeeVersionComparison;
};

export function VersionCompareView({ comparison }: VersionCompareViewProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-4">
      <p className="text-sm font-semibold">
        {t("aiEmployees.lifecycle.compare.summary", {
          left: comparison.leftVersionNumber,
          right: comparison.rightVersionNumber,
        })}
      </p>
      {comparison.sections.map((section) => (
        <div key={section.section} className="space-y-2 border-t border-border/40 pt-3 first:border-0 first:pt-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium capitalize">{section.section}</span>
            {section.changed ? (
              <Badge variant="secondary">{t("aiEmployees.lifecycle.compare.changed")}</Badge>
            ) : (
              <Badge variant="outline">{t("aiEmployees.lifecycle.compare.unchanged")}</Badge>
            )}
          </div>
          {section.changed ? (
            <div className="grid gap-2 text-xs md:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-muted/30 p-2">
                <p className="mb-1 font-medium text-muted-foreground">
                  {t("aiEmployees.lifecycle.compare.before")}
                </p>
                <pre className="whitespace-pre-wrap break-words">{section.before || "—"}</pre>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/30 p-2">
                <p className="mb-1 font-medium text-muted-foreground">
                  {t("aiEmployees.lifecycle.compare.after")}
                </p>
                <pre className="whitespace-pre-wrap break-words">{section.after || "—"}</pre>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
