import { memo } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { Progress } from "@/components/ui/progress";
import type { AiEmployeeReadinessScore } from "@/lib/ai-employees/types";

type ReadinessScoreCardProps = {
  readiness: AiEmployeeReadinessScore | null;
  isLoading?: boolean;
};

export const ReadinessScoreCard = memo(function ReadinessScoreCard({
  readiness,
  isLoading,
}: ReadinessScoreCardProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("aiEmployees.lifecycle.readiness.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("aiEmployees.lifecycle.readiness.subtitle")}
          </p>
        </div>
        <span className="text-2xl font-bold tabular-nums">
          {isLoading || !readiness ? "—" : `${readiness.score}%`}
        </span>
      </div>

      {readiness ? (
        <>
          <Progress value={readiness.score} className="h-2" />
          <ul className="space-y-2">
            {readiness.categories.map((category) => (
              <li key={category.id} className="flex items-start gap-2 text-sm">
                {category.ready ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <span className="font-medium">
                    {t(`aiEmployees.lifecycle.readiness.categories.${category.id}`, {
                      defaultValue: category.label,
                    })}
                  </span>
                  {category.missing.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {category.missing
                        .map((item) =>
                          t(`aiEmployees.lifecycle.readiness.missing.${item}`, {
                            defaultValue: item,
                          }),
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </DashboardCard>
  );
});
