import {
  Briefcase,
  Building2,
  Clock,
  Globe,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import type { MyProfile } from "@/lib/types";
import {
  safeAuthEmail,
  safeCompanyName,
  safeDisplayText,
  safeFormatProfileDate,
  safeRoleLabel,
} from "@/lib/profile/display-safe";
import { DashboardCard } from "@/components/dashboard/ui";

type ProfileAccountInformationProps = {
  profile: MyProfile;
};

export function ProfileAccountInformation({ profile }: ProfileAccountInformationProps) {
  const { t } = useTranslation("common");
  const { user, roles } = useAuth();
  const empty = t("common.none");

  if (!profile?.id) {
    return null;
  }

  const displayEmail = safeAuthEmail(user, profile.email);
  const roleLabel = safeRoleLabel(roles);
  const accountStatusLabel =
    profile.is_active === false ? t("profiles.status.inactive") : t("profiles.status.active");

  const lastLogin = safeFormatProfileDate(user?.last_sign_in_at ?? null, "PPpp");
  const createdDate = safeFormatProfileDate(profile.created_at, "PPP");

  const readOnlyFields = [
    {
      label: t("common.email"),
      value: displayEmail ?? empty,
      icon: Mail,
    },
    {
      label: t("profiles.fields.jobTitle"),
      value: safeDisplayText(profile.job_title) ?? empty,
      icon: Briefcase,
    },
    {
      label: t("profiles.fields.company"),
      value: safeCompanyName(profile.company) ?? empty,
      icon: Building2,
    },
    {
      label: t("profiles.fields.role"),
      value: roleLabel ?? empty,
      icon: ShieldCheck,
    },
    {
      label: t("profiles.fields.accountStatus"),
      value: accountStatusLabel,
      icon: User,
    },
    {
      label: t("profiles.fields.createdDate"),
      value: createdDate ? (
        <span dir="ltr">{createdDate}</span>
      ) : (
        empty
      ),
      icon: Clock,
    },
    {
      label: t("profiles.fields.lastLogin"),
      value: lastLogin ? <span dir="ltr">{lastLogin}</span> : t("profiles.lastLoginUnavailable"),
      icon: Clock,
    },
  ];

  return (
    <DashboardCard className="p-6">
      <h3 className="font-semibold mb-5 flex items-center gap-2">
        <Globe className="w-4 h-4 text-primary" />
        {t("profiles.sections.account")}
      </h3>
      <div className="space-y-3">
        {readOnlyFields.map((field) => (
          <div
            key={field.label}
            className="flex items-start gap-4 p-4 bg-black/20 rounded-xl border border-white/5"
          >
            <field.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
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
