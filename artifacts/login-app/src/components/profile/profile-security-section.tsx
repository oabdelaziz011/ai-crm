import { safeDisplayText } from "@/lib/profile/display-safe";
import { useState } from "react";
import { ChevronRight, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProfileChangePasswordDialog } from "@/components/profile/profile-change-password-dialog";
import { DashboardCard } from "@/components/dashboard/ui";

type ProfileSecuritySectionProps = {
  email?: string | null;
};

export function ProfileSecuritySection({ email }: ProfileSecuritySectionProps) {
  const { t } = useTranslation("common");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const resolvedEmail = safeDisplayText(email ?? null);

  return (
    <>
      <DashboardCard className="p-6">
        <h3 className="font-semibold mb-5 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          {t("common.security")}
        </h3>
        <button
          type="button"
          onClick={() => setPasswordDialogOpen(true)}
          className="w-full flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5 hover:bg-black/30 transition-colors group"
        >
          <div className="text-start">
            <p className="text-sm font-medium">{t("profiles.changePassword.action")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("profiles.changePassword.actionDescription")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      </DashboardCard>

      <ProfileChangePasswordDialog
        open={passwordDialogOpen && Boolean(resolvedEmail)}
        onOpenChange={setPasswordDialogOpen}
        email={resolvedEmail ?? ""}
      />
    </>
  );
}
