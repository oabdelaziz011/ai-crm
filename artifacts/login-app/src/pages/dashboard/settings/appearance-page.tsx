import { useTranslation } from "react-i18next";
import { useMyProfile } from "@/hooks/use-my-profile";
import { AppearanceSettingsSection } from "@/components/profile/appearance-settings-section";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";

export function SettingsAppearancePage() {
  const { t } = useTranslation("common");
  const { data: profile, isLoading, error } = useMyProfile();

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={3} />
      </DashboardCard>
    );
  }

  if (error || !profile?.id) {
    return <DashboardErrorBanner message={error?.message ?? t("profiles.loadFailed")} />;
  }

  return (
    <div className="space-y-6">
      <AppearanceSettingsSection />
    </div>
  );
}
