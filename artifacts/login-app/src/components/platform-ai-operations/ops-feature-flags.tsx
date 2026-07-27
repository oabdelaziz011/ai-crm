import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import type { PlatformAiOpsFeatureRow } from "@/lib/platform-ai-operations";

type OpsFeatureFlagsProps = {
  rows: PlatformAiOpsFeatureRow[];
  loading?: boolean;
};

function FlagCell({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Check className="mx-auto size-4 text-emerald-400" aria-label="Enabled" />
  ) : (
    <X className="mx-auto size-4 text-muted-foreground" aria-label="Disabled" />
  );
}

export function OpsFeatureFlags({ rows, loading }: OpsFeatureFlagsProps) {
  const { t } = useTranslation("common");
  const flags = ["ai_chat", "tool_calling", "knowledge", "automation", "voice"] as const;

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.features.title")}</h3>
      </div>
      {loading ? (
        <DashboardTableSkeleton rows={6} />
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="sticky top-0 bg-card/95">
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="px-4 py-2 text-start">{t("platformAiOps.features.company")}</th>
                {flags.map((flag) => (
                  <th key={flag} className="px-2 py-2 text-center">
                    {t(`platformAiOps.features.${flag}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.company_id} className="border-b border-border/30">
                  <td className="px-4 py-2.5 font-medium">{row.company_name}</td>
                  <td className="px-2 py-2.5"><FlagCell enabled={row.ai_chat} /></td>
                  <td className="px-2 py-2.5"><FlagCell enabled={row.tool_calling} /></td>
                  <td className="px-2 py-2.5"><FlagCell enabled={row.knowledge} /></td>
                  <td className="px-2 py-2.5"><FlagCell enabled={row.automation} /></td>
                  <td className="px-2 py-2.5"><FlagCell enabled={row.voice} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}
