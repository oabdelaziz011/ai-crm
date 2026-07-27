import { useTranslation } from "react-i18next";
import { Package, Puzzle, RefreshCw, Shield, Activity, Store, Code2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useHasPermission } from "@/hooks/use-rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useMarketplaceOverview,
  useMarketplaceCatalog,
  useInstalledPlugins,
  usePluginMonitoring,
  usePluginAuditLog,
  useInstallPlugin,
  useEnablePlugin,
  useDisablePlugin,
  useUninstallPlugin,
} from "@/lib/plugins/hooks/use-marketplace-dashboard";

type MarketplaceDashboardPageProps = Record<string, never>;

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "enabled") return "default";
  if (status === "disabled") return "secondary";
  if (status === "error") return "destructive";
  return "outline";
}

export function MarketplaceDashboardPage(_props: MarketplaceDashboardPageProps) {
  const { t } = useTranslation("common");
  const { profile, user } = useAuth();
  const canView = useHasPermission("marketplace.view");
  const canManage = useHasPermission("marketplace.manage");
  const companyId = profile?.company_id ?? null;

  const { data: overview } = useMarketplaceOverview(companyId);
  const { data: catalog = [] } = useMarketplaceCatalog();
  const { data: installed = [] } = useInstalledPlugins(companyId);
  const { data: monitoring } = usePluginMonitoring(companyId);
  const { data: auditLog = [] } = usePluginAuditLog(companyId);

  const installPlugin = useInstallPlugin(companyId);
  const enablePlugin = useEnablePlugin(companyId);
  const disablePlugin = useDisablePlugin(companyId);
  const uninstallPlugin = useUninstallPlugin(companyId);

  const installedIds = new Set(installed.map((i) => i.pluginId));
  const available = catalog.filter((c) => !installedIds.has(c.pluginId));

  if (!canView) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("marketplace.noPermission")}
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("marketplace.noCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">{t("marketplace.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("marketplace.subtitle")}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("marketplace.overviewTitle")}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("marketplace.installed")}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview?.installedCount ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("marketplace.enabled")}</CardTitle>
            <Puzzle className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview?.enabledCount ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("marketplace.available")}</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview?.availableCount ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("marketplace.health")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.unhealthyCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">{t("marketplace.unhealthy")}</p>
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="installed" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="installed">{t("marketplace.installed")}</TabsTrigger>
          <TabsTrigger value="browse">{t("marketplace.browse")}</TabsTrigger>
          <TabsTrigger value="permissions">{t("marketplace.permissions")}</TabsTrigger>
          <TabsTrigger value="health">{t("marketplace.health")}</TabsTrigger>
          <TabsTrigger value="developer">{t("marketplace.developer")}</TabsTrigger>
          <TabsTrigger value="logs">{t("marketplace.logs")}</TabsTrigger>
        </TabsList>

        <TabsContent value="installed">
          <Card>
            <CardHeader><CardTitle>{t("marketplace.installedPlugins")}</CardTitle></CardHeader>
            <CardContent>
              {installed.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("marketplace.noInstalled")}</p>
              ) : (
                <ul className="space-y-3">
                  {installed.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.pluginName}</span>
                          <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                          <span className="text-xs text-muted-foreground">v{p.version}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{p.pluginId}</p>
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          {p.status !== "enabled" && (
                            <Button size="sm" onClick={() => enablePlugin.mutate({ installationId: p.id, actorId: user?.id })}>
                              {t("marketplace.enable")}
                            </Button>
                          )}
                          {p.status === "enabled" && (
                            <Button size="sm" variant="outline" onClick={() => disablePlugin.mutate({ installationId: p.id, actorId: user?.id })}>
                              {t("marketplace.disable")}
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => uninstallPlugin.mutate({ installationId: p.id, actorId: user?.id })}>
                            {t("marketplace.uninstall")}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="browse">
          <Card>
            <CardHeader><CardTitle>{t("marketplace.availablePlugins")}</CardTitle></CardHeader>
            <CardContent>
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("marketplace.allInstalled")}</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {available.map((p) => (
                    <li key={p.id} className="rounded-md border p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {p.isOfficial && <Badge>{t("marketplace.official")}</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                      <Badge variant="outline" className="mt-2 capitalize">{p.category}</Badge>
                      {canManage && (
                        <Button
                          className="mt-3"
                          size="sm"
                          disabled={installPlugin.isPending}
                          onClick={() => installPlugin.mutate({ registryId: p.id, permissions: p.permissions, actorId: user?.id })}
                        >
                          {t("marketplace.install")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" aria-hidden />
                {t("marketplace.permissions")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">{t("marketplace.permissionsHint")}</p>
              {installed.map((p) => (
                <div key={p.id} className="mb-3 rounded-md border p-3">
                  <p className="font-medium">{p.pluginName}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.grantedPermissions.map((perm) => (
                      <Badge key={perm} variant="outline">{perm}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" aria-hidden />
                {t("marketplace.healthMonitoring")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t("marketplace.executions")}</p>
                  <p className="text-2xl font-bold">{monitoring?.totalExecutions ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("marketplace.errors")}</p>
                  <p className="text-2xl font-bold">{monitoring?.totalErrors ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("marketplace.avgExecution")}</p>
                  <p className="text-2xl font-bold">{monitoring?.avgExecutionMs ?? 0}ms</p>
                </div>
              </div>
              {(monitoring?.health ?? []).map((h) => (
                <div key={h.installationId} className="flex justify-between rounded-md border p-3 text-sm">
                  <span>{h.pluginId}</span>
                  <Badge variant={h.status === "healthy" ? "default" : "destructive"}>{h.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="developer">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" aria-hidden />
                {t("marketplace.developerCenter")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("marketplace.developerHint")}</p>
              <Button className="mt-4" variant="outline" disabled>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                {t("marketplace.comingSoon")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle>{t("marketplace.logs")}</CardTitle></CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("marketplace.noLogs")}</p>
              ) : (
                <ul className="space-y-2">
                  {auditLog.map((entry) => (
                    <li key={entry.id} className="flex justify-between rounded-md border px-3 py-2 text-sm">
                      <span><Badge variant="outline">{entry.action}</Badge> {entry.pluginId}</span>
                      <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
