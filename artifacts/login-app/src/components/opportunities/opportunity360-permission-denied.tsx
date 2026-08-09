import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EnterpriseEmptyState } from "@/components/enterprise";

export function OpportunityPermissionDeniedState({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("common");
  return (
    <EnterpriseEmptyState
      compact={compact}
      icon={<ShieldAlert className="size-6" aria-hidden />}
      title={t("opportunities.permissionDenied")}
      description={t("opportunities.permissionDeniedBody")}
    />
  );
}
