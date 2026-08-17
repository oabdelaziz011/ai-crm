import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";

/**
 * Drafts — no dedicated draft store exists yet.
 * Surface an empty state rather than inventing a parallel draft system.
 */
export function EmailDraftsPage() {
  const { t } = useTranslation("common");
  return (
    <DashboardCard className="p-6">
      <h2 className="text-lg font-semibold">{t("emailModule.drafts.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("emailModule.drafts.empty")}</p>
    </DashboardCard>
  );
}
