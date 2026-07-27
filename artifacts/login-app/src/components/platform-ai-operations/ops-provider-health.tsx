import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { PlatformAiOpsProviderHealth } from "@/lib/platform-ai-operations";

type OpsProviderHealthProps = {
  data?: PlatformAiOpsProviderHealth;
  loading?: boolean;
};

const STATUS_STYLES = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
} as const;

export function OpsProviderHealth({ data, loading }: OpsProviderHealthProps) {
  const { t } = useTranslation("common");
  const status = data?.status ?? "unknown";

  return (
    <DashboardCard className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t("platformAiOps.health.title")}</h3>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
            STATUS_STYLES[status],
          )}
        >
          {status === "green" && <CheckCircle2 className="size-3.5" />}
          {status === "yellow" && <AlertTriangle className="size-3.5" />}
          {status === "red" && <AlertTriangle className="size-3.5" />}
          {status === "unknown" && <HelpCircle className="size-3.5" />}
          {t(`platformAiOps.health.status.${status}`)}
        </span>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: t("platformAiOps.health.provider"), value: data?.providerKey?.toUpperCase() ?? "OpenAI" },
            { label: t("platformAiOps.health.latency"), value: `${data?.latencyMs ?? 0} ms` },
            { label: t("platformAiOps.health.successRate"), value: `${data?.successRate ?? 100}%` },
            { label: t("platformAiOps.health.rate429"), value: String(data?.rate429 ?? 0) },
            { label: t("platformAiOps.health.rate5xx"), value: String(data?.rate5xx ?? 0) },
            { label: t("platformAiOps.health.queue"), value: String(data?.queueDepth ?? 0) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-sm font-medium">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {data?.lastError && (
        <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {t("platformAiOps.health.lastError")}: {data.lastError}
        </p>
      )}
    </DashboardCard>
  );
}
