import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PlatformAiOpsAlert } from "@/lib/platform-ai-operations";
import { cn } from "@/lib/utils";

type OpsAlertsBannerProps = {
  alerts: PlatformAiOpsAlert[];
};

export function OpsAlertsBanner({ alerts }: OpsAlertsBannerProps) {
  const { t } = useTranslation("common");
  const active = alerts.filter((a) => !a.acknowledged).slice(0, 3);
  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      {active.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
            alert.severity === "critical"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-100",
          )}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">{alert.title}</p>
            <p className="text-xs opacity-90">{alert.message}</p>
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">{t("platformAiOps.alerts.hint")}</p>
    </div>
  );
}
