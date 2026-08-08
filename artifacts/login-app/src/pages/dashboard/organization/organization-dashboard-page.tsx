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
  Shield,
  ArrowRightLeft,
  BarChart3,
  Users,
  Activity,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser, useHasPermission } from "@/hooks/use-rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function HierarchyTree({ nodes, depth = 0 }: { nodes: HierarchyNode[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "space-y-1" : "ml-4 space-y-1 border-l pl-3"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="text-xs capitalize">
              {node.level.replace("_", " ")}
            </Badge>
            <span className="font-medium">{node.name}</span>
            {typeof node.metadata?.healthScore === "number" && (
              <span className="text-muted-foreground">({node.metadata.healthScore})</span>
            )}
          </div>
          {node.children.length > 0 && <HierarchyTree nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function transferStatusVariant(status: OrganizationTransfer["status"]): "default" | "secondary" | "destructive" | "outline" {
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
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: overview, isLoading: overviewLoading } = useOrganizationOverview(companyId);
  const { data: analytics, isLoading: analyticsLoading } = useOrganizationAnalytics(companyId, today);
  const { data: transfers = [], isLoading: transfersLoading } = useOrganizationTransfers(companyId);
  const { data: searchResults = [], isLoading: searchLoading } = useOrganizationSearch(companyId, searchQuery);
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

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("organization.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("organization.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => setLocation(companyWorkspaceHref("branches"))}>
          <Building2 className="mr-2 h-4 w-4" aria-hidden />
          {t("organization.manageBranches")}
        </Button>
      </header>

      {/* Organization Overview KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label={t("organization.overviewTitle")}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("organization.regions")}</CardTitle>
            <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.regionCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("organization.branches")}</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.branchCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("organization.departments")}</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.departmentCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("organization.resources")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.resourceCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("organization.healthScore")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.averageHealthScore ?? 100}</div>
            <p className="text-xs text-muted-foreground">
              {t("organization.pendingTransfers", { count: overview?.pendingTransfers ?? 0 })}
            </p>
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="hierarchy" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="hierarchy">{t("organization.hierarchyTitle")}</TabsTrigger>
          <TabsTrigger value="branches">{t("organization.branchExplorer")}</TabsTrigger>
          <TabsTrigger value="comparison">{t("organization.branchComparison")}</TabsTrigger>
          <TabsTrigger value="resources">{t("organization.resourceAllocation")}</TabsTrigger>
          <TabsTrigger value="transfers">{t("organization.transfersTitle")}</TabsTrigger>
          <TabsTrigger value="policies">{t("organization.policyTitle")}</TabsTrigger>
          <TabsTrigger value="search">{t("organization.searchTitle")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("organization.analyticsTitle")}</TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" aria-hidden />
                {t("organization.hierarchyTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">{t("organization.loading")}</p>
              ) : overview?.hierarchy?.length ? (
                <HierarchyTree nodes={overview.hierarchy} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("organization.noHierarchy")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches">
          <Card>
            <CardHeader>
              <CardTitle>{t("organization.branchExplorer")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">{t("organization.branchExplorerHint")}</p>
              <Button variant="outline" onClick={() => setLocation(companyWorkspaceHref("branches"))}>
                {t("organization.openBranchSettings")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison">
          <Card>
            <CardHeader>
              <CardTitle>{t("organization.branchComparison")}</CardTitle>
            </CardHeader>
            <CardContent>
              {(analytics?.comparisons ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("organization.noComparison")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">{t("organization.rank")}</th>
                        <th className="pb-2 pr-4">{t("organization.branch")}</th>
                        <th className="pb-2 pr-4">{t("organization.region")}</th>
                        <th className="pb-2 pr-4">{t("organization.revenue")}</th>
                        <th className="pb-2 pr-4">{t("organization.bookings")}</th>
                        <th className="pb-2 pr-4">{t("organization.noShowRate")}</th>
                        <th className="pb-2">{t("organization.healthScore")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.comparisons ?? []).map((row) => (
                        <tr key={row.branchId} className="border-b">
                          <td className="py-2 pr-4">#{row.ranking}</td>
                          <td className="py-2 pr-4 font-medium">{row.branchName}</td>
                          <td className="py-2 pr-4">{row.regionName ?? "—"}</td>
                          <td className="py-2 pr-4">{formatMoney(row.revenueCents)}</td>
                          <td className="py-2 pr-4">{row.bookings}</td>
                          <td className="py-2 pr-4">{row.noShowRate}%</td>
                          <td className="py-2">{row.healthScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources">
          <Card>
            <CardHeader>
              <CardTitle>{t("organization.resourceAllocation")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("organization.resourceCountHint", { count: overview?.resourceCount ?? 0 })}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" aria-hidden />
                {t("organization.transfersTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("organization.noTransfers")}</p>
              ) : (
                <ul className="space-y-3">
                  {transfers.map((tr) => (
                    <li key={tr.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={transferStatusVariant(tr.status)}>{tr.status}</Badge>
                          <span className="font-medium capitalize">{tr.transferType}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tr.entityType} · {tr.entityId.slice(0, 8)}…
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {canApprove && tr.status === "pending" && user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={approveTransfer.isPending}
                            onClick={() => approveTransfer.mutate({ transferId: tr.id, approverId: user.id })}
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

        <TabsContent value="policies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" aria-hidden />
                {t("organization.policyTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("organization.policyHint")}</p>
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
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder={t("organization.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t("organization.searchPlaceholder")}
              />
              {searchQuery.length >= 2 && (
                searchLoading ? (
                  <p className="text-sm text-muted-foreground">{t("organization.loading")}</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("organization.noSearchResults")}</p>
                ) : (
                  <ul className="space-y-2">
                    {searchResults.map((r) => (
                      <li key={`${r.type}-${r.id}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Badge variant="outline" className="capitalize">{r.type}</Badge>
                        <span>{r.label}</span>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
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
      </Tabs>
    </div>
  );
}
