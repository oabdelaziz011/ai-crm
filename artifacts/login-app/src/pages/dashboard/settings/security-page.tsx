import { ChevronRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useMyProfile } from "@/hooks/use-my-profile";
import { useHasPermission } from "@/hooks/use-rbac";
import { safeAuthEmail } from "@/lib/profile/display-safe";
import { ProfileSecuritySection } from "@/components/profile/profile-security-section";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";

export function SettingsSecurityPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { data: profile, isLoading, error } = useMyProfile();
  const canEditSettings = useHasPermission("settings.edit");

  const displayEmail = safeAuthEmail(user, profile?.email);

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={4} />
      </DashboardCard>
    );
  }

  if (error || !profile?.id) {
    return <DashboardErrorBanner message={error?.message ?? t("profiles.loadFailed")} />;
  }

  return (
    <div className="space-y-6">
      {displayEmail ? <ProfileSecuritySection email={displayEmail} /> : null}

      {canEditSettings && (
        <DashboardCard className="p-6">
          <h3 className="font-semibold mb-5 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            {t("common.security")}
          </h3>
          <div className="space-y-3">
            {[
              {
                label: t("dashboard.settings.security.twoFactor"),
                desc: t("dashboard.settings.security.twoFactorDesc"),
              },
              {
                label: t("dashboard.settings.security.activeSessions"),
                desc: t("dashboard.settings.security.activeSessionsDesc"),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5 hover:bg-black/30 transition-colors cursor-pointer group"
              >
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            ))}
          </div>
        </DashboardCard>
      )}
    </div>
  );
}
