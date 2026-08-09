import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import {
  COMPANY_WORKSPACE_DEFAULT_TABS,
  CompanyWorkspaceShell,
} from "@/components/company-workspace/company-workspace-shell";
import { CompanyBrandingTab } from "@/components/company-workspace/tabs/company-branding-tab";
import { CompanyBranchesTab } from "@/components/company-workspace/tabs/company-branches-tab";
import { CompanyDepartmentsTab } from "@/components/company-workspace/tabs/company-departments-tab";
import { CompanyEmployeesTab } from "@/components/company-workspace/tabs/company-employees-tab";
import { CompanyOverviewTab } from "@/components/company-workspace/tabs/company-overview-tab";
import { CompanySubscriptionTab } from "@/components/company-workspace/tabs/company-subscription-tab";
import { InviteManagedUserDialog } from "@/components/users/invite-managed-user-dialog";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import {
  CompanyWorkspaceProvider,
  useCompanyWorkspace,
} from "@/context/company-workspace-context";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useToast } from "@/hooks/use-toast";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import type { CompanyWorkspaceTabId } from "@/lib/company-workspace/types";

const TAB_IDS: CompanyWorkspaceTabId[] = [
  "overview",
  "employees",
  "branches",
  "departments",
  "branding",
  "subscription",
];

function parseTab(raw: string | null): CompanyWorkspaceTabId | null {
  if (!raw) return null;
  return TAB_IDS.includes(raw as CompanyWorkspaceTabId)
    ? (raw as CompanyWorkspaceTabId)
    : null;
}

function CompanyWorkspaceContent() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { bundle, isLoading, isError, error, permissions, refetch } = useCompanyWorkspace();
  const { identity, displayName } = useCompanyIdentity(Boolean(bundle?.companyId));
  const [activeTab, setActiveTab] = useState<CompanyWorkspaceTabId>(() => {
    const fromUrl = parseTab(new URLSearchParams(search).get("tab"));
    return fromUrl ?? "overview";
  });
  const [inviteOpen, setInviteOpen] = useState(false);

  // Sync tab FROM the URL only when search changes.
  // Do not depend on activeTab — that races click updates against a stale query string
  // and snaps the tab back (regression after invite deep-link handling).
  useEffect(() => {
    const params = new URLSearchParams(search);
    let fromUrl = parseTab(params.get("tab")) ?? "overview";
    if (params.get("employee")?.trim()) {
      fromUrl = "employees";
    }
    if (fromUrl === "subscription" && !permissions.canSubscription) {
      fromUrl = "overview";
    }
    setActiveTab(fromUrl);

    if (params.get("invite") === "1" && permissions.canManageEmployees) {
      setInviteOpen(true);
      const tab = parseTab(params.get("tab")) ?? "overview";
      // Strip invite via ~escaped helper — never nest-prefix /dashboard/company.
      setLocation(companyWorkspaceHref(tab));
    }
  }, [
    search,
    permissions.canSubscription,
    permissions.canManageEmployees,
    setLocation,
  ]);

  const handleTabChange = (tab: CompanyWorkspaceTabId) => {
    setActiveTab(tab);
    setLocation(companyWorkspaceHref(tab));
  };

  const tabs = useMemo(
    () =>
      COMPANY_WORKSPACE_DEFAULT_TABS.map((tab) =>
        tab.id === "subscription" ? { ...tab, hidden: !permissions.canSubscription } : tab,
      ),
    [permissions.canSubscription],
  );

  if (!permissions.canView) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        {t("companyWorkspace.noPermission")}
      </div>
    );
  }

  if (isLoading) return <DashboardPageFallback />;
  if (isError) {
    return <DashboardErrorBanner message={error?.message ?? t("companyWorkspace.empty")} />;
  }
  if (!bundle) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        {t("companyWorkspace.empty")}
      </div>
    );
  }

  const companyName =
    identity?.name || displayName || t("companyWorkspace.title");
  const planLabel = bundle.profile.subscriptionStatus;
  const statusLabel = bundle.profile.status;

  return (
    <>
      <CompanyWorkspaceShell
        companyName={companyName}
        logoUrl={identity?.logoUrl ?? bundle.profile.logoUrl}
        statusLabel={statusLabel}
        planLabel={planLabel}
        employeesCount={bundle.counts.employees}
        branchesCount={bundle.counts.branches}
        departmentsCount={bundle.counts.departments}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        canEditCompany={permissions.canBranding}
        canInvite={permissions.canManageEmployees}
        canSubscription={permissions.canSubscription}
        compactNav={activeTab === "overview"}
        onEditCompany={() => handleTabChange("branding")}
        onInviteEmployee={() => {
          handleTabChange("employees");
          setInviteOpen(true);
        }}
        onManageSubscription={() => handleTabChange("subscription")}
      >
        {activeTab === "overview" ? <CompanyOverviewTab /> : null}
        {activeTab === "employees" ? (
          <CompanyEmployeesTab
            initialEmployeeId={new URLSearchParams(search).get("employee")}
          />
        ) : null}
        {activeTab === "branches" ? <CompanyBranchesTab /> : null}
        {activeTab === "departments" ? <CompanyDepartmentsTab /> : null}
        {activeTab === "branding" ? (
          <CompanyBrandingTab onNavigateToOverview={() => handleTabChange("overview")} />
        ) : null}
        {activeTab === "subscription" ? <CompanySubscriptionTab /> : null}
      </CompanyWorkspaceShell>

      {permissions.canManageEmployees ? (
        <InviteManagedUserDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          companyId={bundle.companyId}
          onNavigateToBranches={() => handleTabChange("branches")}
          onNavigateToDepartments={() => handleTabChange("departments")}
          onSuccess={() => {
            toast({
              title: t("users.success.inviteSentTitle"),
              description: t("users.success.inviteSentDescription"),
            });
            refetch();
          }}
        />
      ) : null}
    </>
  );
}

export function CompanyWorkspaceHost() {
  return (
    <CompanyWorkspaceProvider>
      <CompanyWorkspaceContent />
    </CompanyWorkspaceProvider>
  );
}
