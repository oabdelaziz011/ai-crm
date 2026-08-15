import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  Building2,
  GitBranch,
  Globe2,
  Layers,
  MapPin,
  Search,
  ArrowRightLeft,
  BarChart3,
  Users,
  Activity,
  Sparkles,
  Plus,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser, useHasPermission } from "@/hooks/use-rbac";
import { useCompanyBranchCount } from "@/hooks/company/use-company-branch-count";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import { DashboardStatCard } from "@/components/dashboard/ui";
import { formatMoney } from "@/lib/billing/utilities/money";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import type { HierarchyNode, OrganizationTransfer } from "@/lib/organization/types";
import {
  useOrganizationOverview,
  useOrganizationAnalytics,
  useOrganizationTransfers,
  useOrganizationSearch,
  useApproveTransfer,
  useExecuteTransfer,
} from "@/lib/organization/hooks/use-organization-dashboard";
import { canApproveTransfers } from "@/lib/organization/security/organization-permissions";

type OrganizationDashboardPageProps = Record<string, never>;

function HierarchyTree({
  nodes,
  depth = 0,
  organizationLabel,
}: {
  nodes: HierarchyNode[];
  depth?: number;
  organizationLabel: string;
}) {
  const { t } = useTranslation("common");
  return (
    <ul className={depth === 0 ? "space-y-2" : "ms-4 space-y-2 border-s border-border/60 ps-3"}>
      {nodes.map((node) => {
        const label = node.id === "org" ? organizationLabel : node.name;
        return (
          <li key={node.id}>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-sm">
              <Badge variant="outline" className="text-xs">
                {t(`organization.levels.${node.level}`, {
                  defaultValue: node.level.replace(/_/g, " "),
                })}
              </Badge>
              <span className="font-medium">{label}</span>
              {typeof node.metadata?.healthScore === "number" && (
                <span className="text-xs text-muted-foreground">
                  {t("organization.healthScore")}: {node.metadata.healthScore}
                </span>
              )}
            </div>
            {node.children.length > 0 && (
              <div className="mt-2">
                <HierarchyTree
                  nodes={node.children}
                  depth={depth + 1}
                  organizationLabel={organizationLabel}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function transferStatusVariant(
  status: OrganizationTransfer["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "pending") return "secondary";
  if (status === "rejected" || status === "cancelled") return "destructive";
  return "outline";
}

export function OrganizationDashboardPage(_props: OrganizationDashboardPageProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { profile, user, isSuperAdmin } = useAuth();
  const { permissionCodes } = useAuthUser();
  const canView = useHasPermission("organization.view");
  const canApprove = canApproveTransfers(permissionCodes, isSuperAdmin);
  const companyId = profile?.company_id ?? null;
  const { branchCount, isMultiBranch } = useCompanyBranchCount();
  const { identity } = useCompanyIdentity(Boolean(companyId));
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [searchQuery, setSearchQuery] = useState("");
  const companyLabel = identity?.name?.trim() || t("organization.levels.organization");

  const { data: overview, isLoading: overviewLoading } = useOrganizationOverview(companyId);
  const { data: analytics, isLoading: analyticsLoading } = useOrganizationAnalytics(companyId, today);
  const { data: transfers = [], isLoading: transfersLoading } = useOrganizationTransfers(companyId);
  const { data: searchResults = [], isLoading: searchLoading } = useOrganizationSearch(
    companyId,
    searchQuery,
  );
  const approveTransfer = useApproveTransfer(companyId);
  const executeTransfer = useExecuteTransfer(companyId);

  if (!canView) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("organization.noPermission")}
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("organization.noCompany")}
      </div>
    );
  }

  const isLoading = overviewLoading || analyticsLoading || transfersLoading;
  const resolvedBranchCount = overview?.branchCount ?? branchCount;
  const comparisons = analytics?.comparisons ?? [];

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("organization.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("organization.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLocation(companyWorkspaceHref("departments"))}>
            <Layers className="me-2 h-4 w-4" aria-hidden />
            {t("organization.manageDepartments")}
          </Button>
          <Button onClick={() => setLocation(companyWorkspaceHref("branches"))}>
            <Building2 className="me-2 h-4 w-4" aria-hidden />
            {t("organization.manageBranches")}
          </Button>
        </div>
      </header>

      <ModulePurposeBanner
        title={t("organization.purpose.title")}
        body={t("organization.purpose.body")}
        points={[
          t("organization.purpose.pointStructure"),
          t("organization.purpose.pointOps"),
          t("organization.purpose.pointScale"),
        ]}
        links={[
          {
            href: companyWorkspaceHref("branches"),
            label: t("organization.purpose.openBranches"),
            icon: Building2,
            variant: "secondary",
          },
          {
            href: "/dashboard/executive",
            label: t("organization.purpose.openExecutive"),
            icon: Sparkles,
          },
        ]}
      />

      {!isMultiBranch && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="max-w-2xl space-y-1">
              <p className="text-sm font-semibold">{t("organization.growthTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {t("organization.growthBody", { count: resolvedBranchCount })}
              </p>
            </div>
            <Button variant="outline" onClick={() => setLocation(companyWorkspaceHref("branches"))}>
              <Plus className="me-2 h-4 w-4" aria-hidden />
              {t("organization.addBranchCta")}
            </Button>
          </CardContent>
        </Card>
      )}

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label={t("organization.overviewTitle")}
      >
        <DashboardStatCard
          label={t("organization.regions")}
          value={overview?.regionCount ?? 0}
          icon={Globe2}
          loading={overviewLoading}
        />
        <DashboardStatCard
          label={t("organization.branches")}
          value={resolvedBranchCount}
          icon={MapPin}
          loading={overviewLoading}
        />
        <DashboardStatCard
          label={t("organization.departments")}
          value={overview?.departmentCount ?? 0}
          icon={Layers}
          loading={overviewLoading}
        />
        <DashboardStatCard
          label={t("organization.resources")}
          value={overview?.resourceCount ?? 0}
          icon={Users}
          loading={overviewLoading}
        />
        <DashboardStatCard
          label={t("organization.healthScore")}
          value={overview?.averageHealthScore ?? "—"}
          icon={Activity}
          loading={overviewLoading}
          trend={t("organization.pendingTransfers", {
            count: overview?.pendingTransfers ?? 0,
          })}
        />
      </section>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="overview">{t("organization.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="hierarchy">{t("organization.tabs.hierarchy")}</TabsTrigger>
          <TabsTrigger value="performance">{t("organization.tabs.performance")}</TabsTrigger>
          <TabsTrigger value="transfers">{t("organization.tabs.transfers")}</TabsTrigger>
          <TabsTrigger value="search">{t("organization.tabs.search")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" aria-hidden />
                  {t("organization.branchPulseTitle")}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{t("organization.branchPulseHint")}</p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">{t("organization.loading")}</p>
                ) : comparisons.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{t("organization.noBranchesYet")}</p>
                    <Button onClick={() => setLocation(companyWorkspaceHref("branches"))}>
                      {t("organization.manageBranches")}
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {comparisons.map((row) => (
                      <li
                        key={row.branchId}
                        className="rounded-xl border border-border/60 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{row.branchName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.regionName
                                ? t("organization.regionLabel", { name: row.regionName })
                                : t("organization.noRegion")}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {t("organization.healthScore")}: {row.healthScore}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">{t("organization.revenue")}</p>
                            <p className="font-medium tabular-nums">{formatMoney(row.revenueCents)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t("organization.bookings")}</p>
                            <p className="font-medium tabular-nums">{row.bookings}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t("organization.noShowRate")}</p>
                            <p className="font-medium tabular-nums">{row.noShowRate}%</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("organization.quickSetupTitle")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("organization.quickSetupHint")}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setLocation(companyWorkspaceHref("branches"))}
                >
                  <Building2 className="me-2 h-4 w-4" />
                  {t("organization.setupBranches")}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setLocation(companyWorkspaceHref("departments"))}
                >
                  <Layers className="me-2 h-4 w-4" />
                  {t("organization.setupDepartments")}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setLocation(companyWorkspaceHref("employees"))}
                >
                  <Users className="me-2 h-4 w-4" />
                  {t("organization.setupEmployees")}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => setLocation("/dashboard/executive")}
                >
                  <Sparkles className="me-2 h-4 w-4" />
                  {t("organization.openExecutive")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="hierarchy">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" aria-hidden />
                {t("organization.hierarchyTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("organization.hierarchyHint")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {overviewLoading ? (
                <p className="text-sm text-muted-foreground">{t("organization.loading")}</p>
              ) : overview?.hierarchy?.length ? (
                <HierarchyTree
                  nodes={overview.hierarchy}
                  organizationLabel={companyLabel}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t("organization.noHierarchy")}</p>
                  <Button variant="outline" onClick={() => setLocation(companyWorkspaceHref("branches"))}>
                    {t("organization.openBranchSettings")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("organization.branchComparison")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {isMultiBranch
                  ? t("organization.comparisonHint")
                  : t("organization.comparisonSingleHint")}
              </p>
            </CardHeader>
            <CardContent>
              {comparisons.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("organization.noComparison")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-start text-muted-foreground">
                        <th className="pb-2 pe-4">{t("organization.rank")}</th>
                        <th className="pb-2 pe-4">{t("organization.branch")}</th>
                        <th className="pb-2 pe-4">{t("organization.region")}</th>
                        <th className="pb-2 pe-4">{t("organization.revenue")}</th>
                        <th className="pb-2 pe-4">{t("organization.bookings")}</th>
                        <th className="pb-2 pe-4">{t("organization.noShowRate")}</th>
                        <th className="pb-2">{t("organization.healthScore")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisons.map((row) => (
                        <tr key={row.branchId} className="border-b">
                          <td className="py-2 pe-4">#{row.ranking}</td>
                          <td className="py-2 pe-4 font-medium">{row.branchName}</td>
                          <td className="py-2 pe-4">{row.regionName ?? "—"}</td>
                          <td className="py-2 pe-4">{formatMoney(row.revenueCents)}</td>
                          <td className="py-2 pe-4">{row.bookings}</td>
                          <td className="py-2 pe-4">{row.noShowRate}%</td>
                          <td className="py-2">{row.healthScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" aria-hidden />
                  {t("organization.topPerformers")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(analytics?.topPerformers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("organization.noAnalytics")}</p>
                ) : (
                  <ul className="space-y-2">
                    {(analytics?.topPerformers ?? []).map((row) => (
                      <li key={row.branchId} className="flex justify-between text-sm">
                        <span>{row.branchName}</span>
                        <span className="font-medium">{formatMoney(row.revenueCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("organization.underperformers")}</CardTitle>
              </CardHeader>
              <CardContent>
                {(analytics?.underperformers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("organization.noAnalytics")}</p>
                ) : (
                  <ul className="space-y-2">
                    {(analytics?.underperformers ?? []).map((row) => (
                      <li key={row.branchId} className="flex justify-between text-sm">
                        <span>{row.branchName}</span>
                        <span className="text-muted-foreground">{formatMoney(row.revenueCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" aria-hidden />
                {t("organization.transfersTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isMultiBranch
                  ? t("organization.transfersHint")
                  : t("organization.transfersSingleHint")}
              </p>
            </CardHeader>
            <CardContent>
              {transfersLoading ? (
                <p className="text-sm text-muted-foreground">{t("organization.loading")}</p>
              ) : transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("organization.noTransfers")}</p>
              ) : (
                <ul className="space-y-3">
                  {transfers.map((tr) => (
                    <li
                      key={tr.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={transferStatusVariant(tr.status)}>
                            {t(`organization.transferStatus.${tr.status}`, {
                              defaultValue: tr.status,
                            })}
                          </Badge>
                          <span className="font-medium">
                            {t(`organization.transferType.${tr.transferType}`, {
                              defaultValue: tr.transferType,
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(`organization.entityType.${tr.entityType}`, {
                            defaultValue: tr.entityType,
                          })}{" "}
                          · {tr.entityId.slice(0, 8)}…
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {canApprove && tr.status === "pending" && user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={approveTransfer.isPending}
                            onClick={() =>
                              approveTransfer.mutate({ transferId: tr.id, approverId: user.id })
                            }
                          >
                            {t("organization.approve")}
                          </Button>
                        )}
                        {canApprove && tr.status === "approved" && (
                          <Button
                            size="sm"
                            disabled={executeTransfer.isPending}
                            onClick={() => executeTransfer.mutate(tr.id)}
                          >
                            {t("organization.execute")}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" aria-hidden />
                {t("organization.searchTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("organization.searchHint")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder={t("organization.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t("organization.searchPlaceholder")}
              />
              {searchQuery.length >= 2 &&
                (searchLoading ? (
                  <p className="text-sm text-muted-foreground">{t("organization.loading")}</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("organization.noSearchResults")}</p>
                ) : (
                  <ul className="space-y-2">
                    {searchResults.map((r) => (
                      <li
                        key={`${r.type}-${r.id}`}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <Badge variant="outline">
                          {t(`organization.searchTypes.${r.type}`, { defaultValue: r.type })}
                        </Badge>
                        <span>{r.label}</span>
                      </li>
                    ))}
                  </ul>
                ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
