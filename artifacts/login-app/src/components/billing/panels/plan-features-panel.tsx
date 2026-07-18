import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";

type PlanFeaturesPanelProps = {
  companyId: string;
  enabled?: boolean;
};

const SOURCE_TONE: Record<string, string> = {
  plan: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  override: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  default: "border-slate-500/20 bg-slate-500/10 text-slate-300",
};

export function PlanFeaturesPanel({ companyId, enabled = true }: PlanFeaturesPanelProps) {
  const { t } = useTranslation("common");
  const { data: entitlements = [], isLoading, error } = useCompanyEntitlements(companyId, enabled);

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-white/5 p-5">
        <h2 className="font-semibold">{t("billing.detail.features")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.detail.featuresHint")}</p>
      </div>

      {error ? (
        <p className="p-4 text-sm text-destructive">{error.message}</p>
      ) : isLoading ? (
        <div className="p-5">
          <DashboardTableSkeleton rows={5} />
        </div>
      ) : entitlements.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noFeatures")} icon={Sparkles} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("billing.detail.featureName")}</TableHead>
                <TableHead>{t("billing.detail.featureSource")}</TableHead>
                <TableHead>{t("billing.tables.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entitlements.map((item) => (
                <TableRow key={item.feature_code}>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={SOURCE_TONE[item.source] ?? ""}>
                      {t(`billing.detail.featureSources.${item.source}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={item.enabled ? "text-emerald-400" : "text-muted-foreground"}>
                      {item.enabled ? t("billing.common.enabled") : t("billing.common.disabled")}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DashboardCard>
  );
}
