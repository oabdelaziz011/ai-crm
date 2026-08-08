import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Building2,
  Layers,
  Mail,
  Phone,
  Shield,
  UserCheck,
  UserX,
  KeyRound,
  Send,
  Pencil,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmployeeBranchBadges } from "@/components/users/employee-branch-badges";
import { EmployeeRoleBadge } from "@/components/users/employee-role-badge";
import { useEmployeeAuditActivity } from "@/hooks/company-workspace/use-employee-audit-activity";
import type {
  CompanyEmployeeAuthMeta,
  ManagedUser,
} from "@/hooks/use-users-management";
import { avatarColorFromId } from "@/lib/company-workspace/employees/avatar-color";
import { resolveLastLogin } from "@/lib/company-workspace/employees/last-login-label";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  user: ManagedUser | null;
  roleName: string | null | undefined;
  branchLabels: string[];
  authMeta?: CompanyEmployeeAuthMeta;
  isBranchManager: boolean;
  isDepartmentManager: boolean;
  canManage: boolean;
  isSelf: boolean;
  onEdit: () => void;
  onResetPassword: () => void;
  onResendInvitation: () => void;
  onSuspendOrActivate: () => void;
  onDelete: () => void;
};

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  return (name.charAt(0) || "U").toUpperCase();
}

function activityLabel(
  action: string,
  entity: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const a = action.toLowerCase();
  const e = entity.toLowerCase();
  if (a.includes("password") || a.includes("reset")) {
    return t("companyWorkspace.employees.activity.passwordReset");
  }
  if (a.includes("invite") || a.includes("provision") || a.includes("resend")) {
    return t("companyWorkspace.employees.activity.invitationSent");
  }
  if (a.includes("role") || e.includes("role")) {
    return t("companyWorkspace.employees.activity.roleChanged");
  }
  if (a.includes("branch") || e.includes("branch")) {
    return t("companyWorkspace.employees.activity.branchChanged");
  }
  if (a.includes("update") || a.includes("profile") || e.includes("profile")) {
    return t("companyWorkspace.employees.activity.profileUpdated");
  }
  return action || entity || t("companyWorkspace.employees.activity.generic");
}

export function EmployeeQuickProfileSheet({
  open,
  onOpenChange,
  companyId,
  user,
  roleName,
  branchLabels,
  authMeta,
  isBranchManager,
  isDepartmentManager,
  canManage,
  isSelf,
  onEdit,
  onResetPassword,
  onResendInvitation,
  onSuspendOrActivate,
  onDelete,
}: Props) {
  const { t } = useTranslation("common");
  const activityQuery = useEmployeeAuditActivity(
    companyId,
    open && user ? user.id : null,
    open,
  );
  const activity = activityQuery.data ?? [];

  if (!user) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0" />
      </Sheet>
    );
  }

  const fullName = user.full_name?.trim() || user.email || "";
  const lastLogin = resolveLastLogin(authMeta, t);
  const fallbackBg = avatarColorFromId(user.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b border-border/60 px-5 pb-4 pt-5 text-start">
          <SheetTitle className="sr-only">
            {t("companyWorkspace.employees.quickProfile.title", { name: fullName })}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("companyWorkspace.employees.quickProfile.description")}
          </SheetDescription>

          <div className="flex items-start gap-3 pe-8">
            <Avatar className="size-14 shrink-0">
              {user.avatar_url ? (
                <AvatarImage src={user.avatar_url} alt={fullName} />
              ) : null}
              <AvatarFallback
                className="text-sm font-semibold text-white"
                style={{ backgroundColor: fallbackBg }}
              >
                {initials(fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-lg font-semibold leading-tight text-foreground">
                {fullName}
              </p>
              {user.job_title?.trim() ? (
                <p className="truncate text-sm text-muted-foreground">{user.job_title}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {roleName ? <EmployeeRoleBadge roleName={roleName} /> : null}
                <Badge
                  variant="secondary"
                  className={cn(
                    "px-2 py-0 text-[10px] font-medium",
                    user.is_active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {user.is_active
                    ? t("companyWorkspace.employees.status.active")
                    : t("companyWorkspace.employees.status.inactive")}
                </Badge>
                {isBranchManager ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-primary/30 bg-primary/5 px-2 py-0 text-[10px] text-primary"
                  >
                    <Building2 className="size-3" />
                    {t("companyWorkspace.employees.badges.branchManager")}
                  </Badge>
                ) : null}
                {isDepartmentManager ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-primary/30 bg-primary/5 px-2 py-0 text-[10px] text-primary"
                  >
                    <Layers className="size-3" />
                    {t("companyWorkspace.employees.badges.departmentManager")}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 px-5 py-4">
            {branchLabels.length > 0 ? (
              <section aria-label={t("companyWorkspace.employees.columns.branch")}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("companyWorkspace.employees.columns.branch")}
                </p>
                <EmployeeBranchBadges labels={branchLabels} maxVisible={6} />
              </section>
            ) : null}

            {user.department?.trim() ? (
              <Field
                label={t("companyWorkspace.employees.columns.department")}
                value={user.department}
              />
            ) : null}

            {user.email?.trim() ? (
              <Field
                label={t("companyWorkspace.employees.columns.email")}
                value={user.email}
                icon={<Mail className="size-3.5" />}
                dir="ltr"
              />
            ) : null}

            {user.phone?.trim() ? (
              <Field
                label={t("companyWorkspace.employees.columns.phone")}
                value={user.phone}
                icon={<Phone className="size-3.5" />}
                dir="ltr"
              />
            ) : null}

            <Field
              label={t("companyWorkspace.employees.columns.lastLogin")}
              value={lastLogin.label}
              muted={lastLogin.kind !== "relative"}
            />

            {activity.length > 0 ? (
              <section aria-label={t("companyWorkspace.employees.activity.title")}>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("companyWorkspace.employees.activity.title")}
                </p>
                <ul className="space-y-2">
                  {activity.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {activityLabel(item.action, item.entity, t)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground" dir="ltr">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </ScrollArea>

        {canManage ? (
          <div className="sticky bottom-0 border-t border-border/60 bg-card/95 px-4 py-3 backdrop-blur">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-9 gap-1.5"
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
                {t("companyWorkspace.employees.actions.editEmployee")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={onResetPassword}
              >
                <KeyRound className="size-3.5" />
                {t("companyWorkspace.employees.actions.resetPassword")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={onResendInvitation}
              >
                <Send className="size-3.5" />
                {t("companyWorkspace.employees.actions.resendInvitation")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={onSuspendOrActivate}
              >
                {user.is_active ? (
                  <>
                    <UserX className="size-3.5" />
                    {t("companyWorkspace.employees.actions.suspend")}
                  </>
                ) : (
                  <>
                    <UserCheck className="size-3.5" />
                    {t("companyWorkspace.employees.actions.activate")}
                  </>
                )}
              </Button>
              {!isSelf ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="col-span-2 h-9 gap-1.5 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="size-3.5" />
                  {t("companyWorkspace.employees.actions.delete")}
                </Button>
              ) : null}
            </div>
            {roleName ? (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Shield className="size-3" />
                {roleName}
              </p>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  icon,
  muted,
  dir,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  muted?: boolean;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "flex items-center gap-1.5 text-sm",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
        dir={dir}
      >
        {icon}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}
