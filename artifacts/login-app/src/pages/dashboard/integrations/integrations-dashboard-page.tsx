import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Key, Webhook, Plug, BarChart3, Activity, Copy, Check, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useHasPermission } from "@/hooks/use-rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useIntegrationOverview,
  useIntegrationApiKeys,
  useIntegrationWebhooks,
  useIntegrationDeliveries,
  useIntegrationMonitoring,
  useCreateApiKey,
  useCreateWebhook,
  useRetryWebhookDelivery,
} from "@/lib/integration/hooks/use-integration-dashboard";
import { CONNECTOR_REGISTRY } from "@/lib/integration/connectors/connector-registry";
import { WEBHOOK_EVENT_TYPES } from "@/lib/integration/events/event-registry";
import type { ApiScope } from "@/lib/integration/types";

type IntegrationsDashboardPageProps = Record<string, never>;

const DEFAULT_SCOPES: ApiScope[] = ["customers.read", "bookings.read", "branches.read"];

export function IntegrationsDashboardPage(_props: IntegrationsDashboardPageProps) {
  const { t } = useTranslation("common");
  const { profile, user } = useAuth();
  const canView = useHasPermission("integrations.view");
  const canManage = useHasPermission("integrations.manage");
  const companyId = profile?.company_id ?? null;

  const { data: overview } = useIntegrationOverview(companyId);
  const { data: apiKeys = [] } = useIntegrationApiKeys(companyId);
  const { data: webhooks = [] } = useIntegrationWebhooks(companyId);
  const { data: deliveries = [] } = useIntegrationDeliveries(companyId);
  const { data: monitoring } = useIntegrationMonitoring(companyId);

  const createKey = useCreateApiKey(companyId);
  const createWebhook = useCreateWebhook(companyId);
  const retryDelivery = useRetryWebhookDelivery(companyId);

  const [newKeyName, setNewKeyName] = useState("");
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const apiDocsUrl = useMemo(() => "/api/v1/docs", []);

  if (!canView) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("integrations.noPermission")}
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("integrations.noCompany")}
      </div>
    );
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    const result = await createKey.mutateAsync({ name: newKeyName, scopes: DEFAULT_SCOPES, createdBy: user?.id });
    setRevealedSecret(result.secret);
    setNewKeyName("");
  };

  const handleCreateWebhook = async () => {
    if (!newWebhookName.trim() || !newWebhookUrl.trim()) return;
    await createWebhook.mutateAsync({
      name: newWebhookName,
      endpointUrl: newWebhookUrl,
      eventTypes: ["booking.created", "customer.created", "invoice.paid"],
    });
    setNewWebhookName("");
    setNewWebhookUrl("");
  };

  const copySecret = async () => {
    if (!revealedSecret) return;
    await navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("integrations.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("integrations.subtitle")}</p>
        </div>
        <Button variant="outline" asChild>
          <a href={apiDocsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
            {t("integrations.apiExplorer")}
          </a>
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("integrations.overviewTitle")}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("integrations.apiKeys")}</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview?.apiKeyCount ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("integrations.webhooks")}</CardTitle>
            <Webhook className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview?.webhookSubscriptionCount ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("integrations.apiCalls24h")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.apiCalls24h ?? 0}</div>
            <p className="text-xs text-muted-foreground">{t("integrations.avgLatency", { ms: overview?.avgLatencyMs ?? 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("integrations.connectors")}</CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview?.connectorCount ?? 0}</div></CardContent>
        </Card>
      </section>

      {revealedSecret && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <span className="text-sm font-medium">{t("integrations.keyCreated")}</span>
            <code className="rounded bg-muted px-2 py-1 text-xs">{revealedSecret}</code>
            <Button size="sm" variant="outline" onClick={() => void copySecret()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="keys">{t("integrations.apiKeys")}</TabsTrigger>
          <TabsTrigger value="webhooks">{t("integrations.webhooks")}</TabsTrigger>
          <TabsTrigger value="deliveries">{t("integrations.deliveries")}</TabsTrigger>
          <TabsTrigger value="registry">{t("integrations.registry")}</TabsTrigger>
          <TabsTrigger value="monitoring">{t("integrations.monitoring")}</TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          <Card>
            <CardHeader><CardTitle>{t("integrations.apiKeys")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Input placeholder={t("integrations.keyNamePlaceholder")} value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="max-w-xs" />
                  <Button onClick={() => void handleCreateKey()} disabled={createKey.isPending}>{t("integrations.generateKey")}</Button>
                </div>
              )}
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("integrations.noKeys")}</p>
              ) : (
                <ul className="space-y-2">
                  {apiKeys.map((key) => (
                    <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                      <div>
                        <span className="font-medium">{key.name}</span>
                        <span className="ml-2 text-muted-foreground">{key.keyPrefix}…</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={key.isActive ? "default" : "secondary"}>{key.isActive ? "active" : "disabled"}</Badge>
                        <span className="text-xs text-muted-foreground">{key.usageCount} calls</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardHeader><CardTitle>{t("integrations.webhookSubscriptions")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Input placeholder={t("integrations.webhookNamePlaceholder")} value={newWebhookName} onChange={(e) => setNewWebhookName(e.target.value)} className="max-w-xs" />
                  <Input placeholder={t("integrations.webhookUrlPlaceholder")} value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} className="max-w-sm" />
                  <Button onClick={() => void handleCreateWebhook()} disabled={createWebhook.isPending}>{t("integrations.createWebhook")}</Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{WEBHOOK_EVENT_TYPES.length} {t("integrations.eventTypes")}</p>
              {webhooks.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("integrations.noWebhooks")}</p>
              ) : (
                <ul className="space-y-2">
                  {webhooks.map((wh) => (
                    <li key={wh.id} className="rounded-md border p-3 text-sm">
                      <div className="font-medium">{wh.name}</div>
                      <div className="text-muted-foreground">{wh.endpointUrl}</div>
                      <div className="mt-1 flex gap-1">
                        {wh.isPaused && <Badge variant="secondary">paused</Badge>}
                        {!wh.isActive && <Badge variant="destructive">inactive</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliveries">
          <Card>
            <CardHeader><CardTitle>{t("integrations.deliveries")}</CardTitle></CardHeader>
            <CardContent>
              {deliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("integrations.noDeliveries")}</p>
              ) : (
                <ul className="space-y-2">
                  {deliveries.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                      <div>
                        <Badge variant="outline">{d.eventType}</Badge>
                        <span className="ml-2">{d.status}</span>
                      </div>
                      {(d.status === "failed" || d.status === "dead_letter") && canManage && (
                        <Button size="sm" variant="outline" onClick={() => retryDelivery.mutate(d.id)}>{t("integrations.retry")}</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registry">
          <Card>
            <CardHeader><CardTitle>{t("integrations.registry")}</CardTitle></CardHeader>
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CONNECTOR_REGISTRY.map((c) => (
                  <li key={c.type} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground">{c.description}</div>
                    <Badge className="mt-2" variant={c.isAvailable ? "default" : "secondary"}>
                      {c.isAvailable ? t("integrations.available") : t("integrations.comingSoon")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" aria-hidden />
                {t("integrations.monitoring")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">{t("integrations.errorRate")}</p>
                  <p className="text-2xl font-bold">{monitoring?.errorRate ?? 0}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("integrations.webhookSuccess")}</p>
                  <p className="text-2xl font-bold">{monitoring?.webhookSuccessRate ?? 100}%</p>
                </div>
              </div>
              {(monitoring?.topEndpoints ?? []).length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">{t("integrations.topEndpoints")}</p>
                  <ul className="space-y-1 text-sm">
                    {monitoring!.topEndpoints.map((ep) => (
                      <li key={ep.path} className="flex justify-between"><span>{ep.path}</span><span>{ep.count}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
