import type { ElementType, ReactNode } from "react";
import {
  Building2,
  CreditCard,
  GitBranch,
  Layers,
  Palette,
  Pencil,
  UserPlus,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import type { CompanyWorkspaceTabId } from "@/lib/company-workspace/types";
import { cn } from "@/lib/utils";

export type CompanyWorkspaceShellTab = {
  id: CompanyWorkspaceTabId;
  labelKey: string;
  icon: ElementType;
  hidden?: boolean;
};

type Props = {
  companyName: string;
  logoUrl: string | null;
  statusLabel: string | null;
  planLabel: string | null;
  employeesCount: number;
  branchesCount: number;
  departmentsCount: number;
  tabs: CompanyWorkspaceShellTab[];
  activeTab: CompanyWorkspaceTabId;
  onTabChange: (tab: CompanyWorkspaceTabId) => void;
  /** Opens Brand Center (only when a real in-workspace editor exists). */
  canEditCompany: boolean;
  canInvite: boolean;
  canSubscription: boolean;
  onEditCompany?: () => void;
  onInviteEmployee?: () => void;
  onManageSubscription?: () => void;
  /**
   * Overview owns the executive header — render tab nav only to avoid duplicated KPIs/actions.
   */
  compactNav?: boolean;
  children: ReactNode;
};

export function CompanyWorkspaceShell({
  companyName,
  logoUrl,
  statusLabel,
  planLabel,
  employeesCount,
  branchesCount,
  departmentsCount,
  tabs,
  activeTab,
  onTabChange,
  canEditCompany,
  canInvite,
  canSubscription,
  onEditCompany,
  onInviteEmployee,
  onManageSubscription,
  compactNav = false,
  children,
}: Props) {
  const { t } = useTranslation("common");
  const initials = companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "C";

  const nav = (
    <nav
      className={cn(
        "flex flex-wrap gap-1",
        compactNav ? "" : "mt-4 border-t border-border/50 pt-3",
      )}
      aria-label={t("companyWorkspace.title")}
    >
      {tabs
        .filter((tab) => !tab.hidden)
        .map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={companyWorkspaceHref(tab.id)}
              onClick={(event) => {
                // One navigation only: ~escaped setLocation via onTabChange.
                // preventDefault blocks Link's second navigate (would double history).
                event.preventDefault();
                onTabChange(tab.id);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/30 bg-primary/12 text-primary"
                  : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-3.5" />
              {t(tab.labelKey)}
            </Link>
          );
        })}
    </nav>
  );

  return (
    <div className="flex min-h-0 flex-col justify-start gap-3 rounded-2xl bg-muted/25 p-3 md:p-4">
      <header className="sticky top-0 z-10 rounded-2xl border border-border/60 bg-card p-3 shadow-sm md:p-4">
        {compactNav ? (
          nav
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-4">
              <Avatar className="size-14 rounded-2xl border border-border/50">
                {logoUrl ? (
                  <AvatarImage src={logoUrl} alt={companyName} className="object-cover" />
                ) : null}
                <AvatarFallback className="rounded-2xl bg-primary/10 text-sm font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight">{companyName}</h1>
                  {planLabel ? (
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {planLabel}
                    </span>
                  ) : null}
                  {statusLabel ? (
                    <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {statusLabel}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5 text-primary" />
                    {t("companyWorkspace.header.employees", { count: employeesCount })}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="size-3.5 text-primary" />
                    {t("companyWorkspace.header.branches", { count: branchesCount })}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    {t("companyWorkspace.header.departments", { count: departmentsCount })}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {canEditCompany && onEditCompany ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={onEditCompany}
                  >
                    <Pencil className="size-3.5" />
                    {t("companyWorkspace.actions.editCompany")}
                  </Button>
                ) : null}
                {canInvite && onInviteEmployee ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={onInviteEmployee}
                  >
                    <UserPlus className="size-3.5" />
                    {t("companyWorkspace.actions.inviteEmployee")}
                  </Button>
                ) : null}
                {canSubscription && onManageSubscription ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={onManageSubscription}
                  >
                    <CreditCard className="size-3.5" />
                    {t("companyWorkspace.actions.manageSubscription")}
                  </Button>
                ) : null}
              </div>
            </div>
            {nav}
          </>
        )}
      </header>

      <div className="min-h-0">{children}</div>
    </div>
  );
}

export const COMPANY_WORKSPACE_DEFAULT_TABS: CompanyWorkspaceShellTab[] = [
  { id: "overview", labelKey: "companyWorkspace.tabs.overview", icon: Building2 },
  { id: "employees", labelKey: "companyWorkspace.tabs.employees", icon: Users },
  { id: "branches", labelKey: "companyWorkspace.tabs.branches", icon: GitBranch },
  { id: "departments", labelKey: "companyWorkspace.tabs.departments", icon: Layers },
  { id: "branding", labelKey: "companyWorkspace.tabs.branding", icon: Palette },
  { id: "subscription", labelKey: "companyWorkspace.tabs.subscription", icon: CreditCard },
];
