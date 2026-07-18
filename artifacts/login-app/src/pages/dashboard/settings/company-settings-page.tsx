import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { safeDisplayText } from "@/lib/profile/display-safe";
import { DashboardCard } from "@/components/dashboard/ui";

export function SettingsCompanySettingsPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const empty = t("common.none");

  const fields = [
    {
      label: t("profiles.fields.company"),
      value: safeDisplayText(company?.name) ?? empty,
    },
    {
      label: t("common.status"),
      value: safeDisplayText(company?.status) ?? empty,
    },
  ];

  return (
    <DashboardCard className="p-6">
      <h3 className="font-semibold mb-5 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-primary" />
        {t("dashboard.settings.nav.companySettings")}
      </h3>
      <div className="space-y-3">
        {fields.map((field) => (
          <div
            key={field.label}
            className="flex items-start gap-4 p-4 bg-black/20 rounded-xl border border-white/5"
          >
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="text-sm font-medium mt-0.5 break-words">{field.value}</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
