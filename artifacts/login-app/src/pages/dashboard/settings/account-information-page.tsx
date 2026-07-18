import { useMyProfile } from "@/hooks/use-my-profile";
import { useTranslation } from "react-i18next";
import { ProfileAccountInformation } from "@/components/profile/profile-account-information";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";

export function SettingsAccountInformationPage() {
  const { t } = useTranslation("common");
  const { data: profile, isLoading, error } = useMyProfile();

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={6} />
      </DashboardCard>
    );
  }

  if (error || !profile?.id) {
    return <DashboardErrorBanner message={error?.message ?? t("profiles.loadFailed")} />;
  }

  return <ProfileAccountInformation profile={profile} />;
}
