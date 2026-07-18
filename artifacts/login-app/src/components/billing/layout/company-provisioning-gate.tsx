import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { ProvisioningIssue } from "@/lib/billing/company-provisioning";

type CompanyProvisioningGateProps = {
  issues: ProvisioningIssue[];
};

export function CompanyProvisioningGate({ issues }: CompanyProvisioningGateProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="p-6 space-y-4 border-rose-500/20 bg-rose-500/5">
      <div className="flex items-start gap-3">
        <Building2 className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("billing.provisioning.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("billing.provisioning.subtitle")}</p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {issues.map((issue) => (
          <li key={issue} className="rounded-xl border border-white/10 bg-background/40 px-4 py-3">
            <p className="font-medium">{t(`billing.provisioning.issues.${issue}.title`)}</p>
            <p className="mt-1 text-muted-foreground">{t(`billing.provisioning.issues.${issue}.description`)}</p>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
