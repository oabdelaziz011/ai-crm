import { useMemo } from "react";
import {
  Briefcase,
  Building2,
  Clock,
  GitBranch,
  Globe,
  Layers,
  Mail,
  Phone,
  ShieldCheck,
  User,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import { useOrganizationDepartments } from "@/hooks/organization/use-organization-departments";
import {
  useBranches,
  useUserBranchAssignmentMap,
} from "@/lib/company/branches/hooks";
import type { MyProfile } from "@/lib/types";
import {
  safeAuthEmail,
  safeDisplayText,
  safeFormatProfileDate,
  safeRoleLabel,
} from "@/lib/profile/display-safe";
import { DashboardCard } from "@/components/dashboard/ui";

type ProfileAccountInformationProps = {
  profile: MyProfile;
};

/**
 * Read-only Account Information — single source of truth from employee/company caches.
 * Job title, department, phone, etc. come from `profiles` (same record Company Workspace edits).
 * Branch from `user_branch_assignments`. Manager from department (or branch) manager assignment.
 */
export function ProfileAccountInformation({ profile }: ProfileAccountInformationProps) {
  const { t } = useTranslation("common");
  const { user, roles } = useAuth();
  const empty = t("common.none");
  const companyId = profile.company_id;
  const employeeId = profile.id;

  const { displayName: companyIdentityName } = useCompanyIdentity(Boolean(companyId));
  const { data: branches = [] } = useBranches(companyId);
  const { data: assignmentMap = {} } = useUserBranchAssignmentMap(companyId);
  const { data: departments = [] } = useOrganizationDepartments(companyId, false);

  const assignedBranches = useMemo(() => {
    const ids = new Set(assignmentMap[employeeId] ?? []);
    if (ids.size === 0) return [];
    return branches.filter((branch) => ids.has(branch.id));
  }, [assignmentMap, branches, employeeId]);

  const matchedDepartment = useMemo(() => {
    const name = profile.department?.trim();
    if (!name) return null;
    return (
      departments.find(
        (dept) =>
          dept.isActive !== false &&
          dept.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
      ) ?? null
    );
  }, [departments, profile.department]);

  const managerUserId = useMemo(() => {
    if (matchedDepartment?.managerUserId) return matchedDepartment.managerUserId;
    const primary =
      assignedBranches.find((branch) => branch.is_primary) ?? assignedBranches[0] ?? null;
    return primary?.manager_user_id ?? null;
  }, [assignedBranches, matchedDepartment?.managerUserId]);

  const { data: managerIdentity } = useEmployeeIdentity(managerUserId);

  if (!profile?.id) {
    return null;
  }

  const displayEmail = safeAuthEmail(user, profile.email);
  const roleLabel = safeRoleLabel(roles);
  const accountStatusLabel =
    profile.is_active === false ? t("profiles.status.inactive") : t("profiles.status.active");

  const lastLogin = safeFormatProfileDate(user?.last_sign_in_at ?? null, "PPpp");
  const createdDate = safeFormatProfileDate(profile.created_at, "PPP");

  const branchLabel =
    assignedBranches.length > 0
      ? assignedBranches.map((branch) => branch.name).join(", ")
      : null;

  const managerLabel = managerIdentity
    ? safeDisplayText(managerIdentity.fullName) ||
      safeDisplayText(managerIdentity.email)
    : null;

  const companyLabel =
    safeDisplayText(companyIdentityName) ||
    safeDisplayText(profile.company?.name) ||
    null;

  const readOnlyFields = [
    {
      label: t("profiles.fields.fullName"),
      value: safeDisplayText(profile.full_name) ?? empty,
      icon: UserRound,
    },
    {
      label: t("profiles.fields.jobTitle"),
      value: safeDisplayText(profile.job_title) ?? empty,
      icon: Briefcase,
    },
    {
      label: t("profiles.fields.department"),
      value: safeDisplayText(profile.department) ?? empty,
      icon: Layers,
    },
    {
      label: t("profiles.fields.branch"),
      value: branchLabel ?? empty,
      icon: GitBranch,
    },
    {
      label: t("profiles.fields.directManager"),
      value: managerLabel ?? empty,
      icon: User,
    },
    {
      label: t("profiles.fields.company"),
      value: companyLabel ?? empty,
      icon: Building2,
    },
    {
      label: t("profiles.fields.role"),
      value: roleLabel ?? empty,
      icon: ShieldCheck,
    },
    {
      label: t("common.email"),
      value: displayEmail ?? empty,
      icon: Mail,
    },
    {
      label: t("profiles.fields.phone"),
      value: safeDisplayText(profile.phone) ?? empty,
      icon: Phone,
    },
    {
      label: t("profiles.fields.accountStatus"),
      value: accountStatusLabel,
      icon: User,
    },
    {
      label: t("profiles.fields.createdDate"),
      value: createdDate ? <span dir="ltr">{createdDate}</span> : empty,
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
      <h3 className="mb-5 flex items-center gap-2 font-semibold">
        <Globe className="h-4 w-4 text-primary" />
        {t("profiles.sections.account")}
      </h3>
      <div className="space-y-3">
        {readOnlyFields.map((field) => (
          <div
            key={field.label}
            className="flex items-start gap-4 rounded-xl border border-white/5 bg-black/20 p-4"
          >
            <field.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="mt-0.5 break-words text-sm font-medium">{field.value}</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
