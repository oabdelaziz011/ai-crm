import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { BillingHealthIssue } from "@/lib/billing/billing-health";

type BillingHealthGateProps = {
  issues: BillingHealthIssue[];
};

export function BillingHealthGate({ issues }: BillingHealthGateProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="p-6 space-y-4 border-amber-500/20 bg-amber-500/5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("billing.health.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("billing.health.subtitle")}</p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {issues.map((issue) => (
          <li key={issue} className="rounded-xl border border-white/10 bg-background/40 px-4 py-3">
            <p className="font-medium">{t(`billing.health.issues.${issue}.title`)}</p>
            <p className="mt-1 text-muted-foreground">{t(`billing.health.issues.${issue}.description`)}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("billing.health.mutationsBlocked")}</p>
    </DashboardCard>
  );
}
