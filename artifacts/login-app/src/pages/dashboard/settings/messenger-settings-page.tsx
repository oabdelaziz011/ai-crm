import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { generateMessengerVerifyToken } from "@workspace/channel-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useMessengerCompanyChannel,
  useMessengerConnectionTest,
  useMessengerOutboundHealth,
  messengerSettingsKey,
  useMessengerSettings,
  useUpdateMessengerSettings,
} from "@/hooks/channels/use-messenger-settings";
import {
  buildMessengerChannelWebhookUrl,
  buildMessengerWebhookUrl,
  resolveChannelWebhookBaseUrl,
} from "@/lib/channels/whatsapp-channel-utils";
import {
  isMessengerApiConfigured,
  revealMessengerWebhookVerifyToken,
  type MessengerSettingsDraft,
} from "@/lib/channels/messenger-settings";
import { resolveMessengerHealthErrorPresentation } from "@/lib/channels/messenger-health-error-message";
import {
  draftWebhookVerifyTokenFromSettings,
  isCopyableWebhookVerifyToken,
} from "@/lib/channels/webhook-verify-token-field";
import { MetaPagesOauthPanel } from "@/components/channels/meta-pages-oauth-panel";
import { isMetaPagesOauthUiEnabled } from "@/lib/channels/meta-pages-oauth-flags";
import { MessengerLoginOauthPanel } from "@/components/channels/messenger-login-oauth-panel";
import { MetaChannelConnectionStrip } from "@/components/channels/meta-channel-connection-strip";
import { ChannelAiEmployeeAssignment } from "@/components/channels/channel-ai-employee-assignment";
import { WebhookVerifyTokenField } from "@/components/channels/webhook-verify-token-field";
import {
  disconnectMetaMessengerLogin,
  fetchMetaMessengerLoginConnection,
  type MetaMessengerLoginConnection,
} from "@/lib/channels/meta-messenger-login-client";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY_SETTINGS: MessengerSettingsDraft = {
  enabled: false,
  provider: "meta_messenger",
  pageId: "",
  accessToken: "",
  webhookVerifyToken: "",
  apiVersion: "v21.0",
  appSecret: "",
};

export function SettingsMessengerPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useMessengerSettings(companyId);
  const messengerChannel = useMessengerCompanyChannel(companyId);
  const companyChannelId = messengerChannel?.id ?? null;

  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = useMessengerOutboundHealth(
    companyId,
    companyChannelId,
  );
  const updateSettings = useUpdateMessengerSettings(companyId);
  const connectionTest = useMessengerConnectionTest(companyId, companyChannelId);

  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [oauthConnection, setOauthConnection] = useState<MetaMessengerLoginConnection | null>(null);

  const refreshAfterOauth = () => {
    void queryClient.invalidateQueries({ queryKey: messengerSettingsKey(companyId) });
    void refetchHealth();
    if (companyId) {
      void fetchMetaMessengerLoginConnection(companyId)
        .then(setOauthConnection)
        .catch(() => setOauthConnection(null));
    }
  };

  useEffect(() => {
    if (!companyId) {
      setOauthConnection(null);
      return;
    }
    void fetchMetaMessengerLoginConnection(companyId)
      .then(setOauthConnection)
      .catch(() => setOauthConnection(null));
  }, [companyId, settings?.updatedAt]);

  const oauthConnected = Boolean(
    oauthConnection?.hasAccessToken &&
      oauthConnection.enabled &&
      oauthConnection.status !== "not_connected",
  );

  const onSoftDisconnect = async () => {
    if (!companyId) return;
    setDisconnectBusy(true);
    try {
      await disconnectMetaMessengerLogin(companyId);
      toast({
        title: t("notifications.messengerLogin.disconnected", {
          defaultValue: "Messenger soft-disconnected",
        }),
      });
      refreshAfterOauth();
    } catch (error) {
      toast({
        title: t("notifications.messengerLogin.disconnectFailed", {
          defaultValue: "Disconnect failed",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDisconnectBusy(false);
    }
  };

  const webhookBaseUrl = resolveChannelWebhookBaseUrl();
  const globalWebhookUrl = useMemo(() => buildMessengerWebhookUrl(webhookBaseUrl), [webhookBaseUrl]);
  const channelWebhookUrl = useMemo(
    () => (companyChannelId ? buildMessengerChannelWebhookUrl(webhookBaseUrl, companyChannelId) : null),
    [webhookBaseUrl, companyChannelId],
  );

  useEffect(() => {
    if (settings) {
      setDraft((prev) => ({
        enabled: settings.enabled,
        provider: settings.provider,
        pageId: settings.pageId,
        accessToken: settings.accessToken,
        // Keep an in-session generated/typed plaintext so Copy matches the token just saved.
        webhookVerifyToken: isCopyableWebhookVerifyToken(prev.webhookVerifyToken)
          ? prev.webhookVerifyToken
          : draftWebhookVerifyTokenFromSettings(settings.webhookVerifyToken),
        apiVersion: settings.apiVersion,
        appSecret: settings.appSecret,
      }));
    }
  }, [settings]);

  const onSave = () => {
    updateSettings.mutate(draft, {
      onSuccess: () => toast({ title: t("notifications.messenger.settings.saved") }),
      onError: (error) =>
        toast({
          title: t("notifications.messenger.settings.saveFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const onConnectionTest = () => {
    if (!companyChannelId) return;
    connectionTest.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok) {
          toast({ title: t("notifications.messenger.settings.connectionTestSuccess") });
        } else {
          const presentation = resolveMessengerHealthErrorPresentation(result.error);
          toast({
            title: t("notifications.messenger.settings.connectionTestFailed"),
            description: presentation.descriptionKey
              ? t(`notifications.messenger.settings.${presentation.descriptionKey}`)
              : presentation.fallbackDescription ??
                t("notifications.messenger.settings.healthFailed", { error: "—" }),
            variant: "destructive",
          });
        }
        void refetchHealth();
      },
      onError: (error) => {
        const presentation = resolveMessengerHealthErrorPresentation(error.message);
        toast({
          title: t("notifications.messenger.settings.connectionTestFailed"),
          description: presentation.descriptionKey
            ? t(`notifications.messenger.settings.${presentation.descriptionKey}`)
            : presentation.fallbackDescription ?? error.message,
          variant: "destructive",
        });
      },
    });
  };

  const onGenerateVerifyToken = () => {
    setDraft((prev) => ({ ...prev, webhookVerifyToken: generateMessengerVerifyToken() }));
  };

  if (!companyId) {
    return (
      <DashboardCard className="p-6">
        <p className="text-sm text-muted-foreground">{t("notifications.noCompany")}</p>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardCard className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{t("notifications.messenger.settings.title")}</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("notifications.loading")}
          </div>
        ) : (
          <>
            <MetaChannelConnectionStrip
              channelLabel={t("notifications.messenger.settings.title")}
              connected={Boolean(
                settings?.enabled && settings.pageId && settings.hasAccessToken && health?.ok,
              )}
              enabled={Boolean(settings?.enabled)}
              connectionStatus={oauthConnection?.status ?? null}
              assetLabel={t("notifications.messenger.settings.pageId")}
              assetValue={oauthConnection?.pageName || settings?.pageId}
              hasAccessToken={Boolean(settings?.hasAccessToken)}
              hasWebhookVerifyToken={Boolean(settings?.hasWebhookVerifyToken)}
              healthOk={health?.ok ?? null}
              healthError={health?.error ?? null}
              onDisconnect={() => void onSoftDisconnect()}
              disconnectBusy={disconnectBusy}
            />
            {companyId ? (
              <MessengerLoginOauthPanel
                companyId={companyId}
                onConnected={refreshAfterOauth}
                onDisconnected={refreshAfterOauth}
              />
            ) : null}
            {companyId ? (
              <ChannelAiEmployeeAssignment
                companyId={companyId}
                companyChannelId={companyChannelId}
                channelLabel={t("notifications.messenger.settings.title")}
              />
            ) : null}
            {companyId && isMetaPagesOauthUiEnabled() ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  {t("notifications.messengerLogin.legacySdk", {
                    defaultValue: "Legacy: Meta Login via Facebook JS SDK",
                  })}
                </summary>
                <div className="mt-2">
                  <MetaPagesOauthPanel
                    companyId={companyId}
                    channel="messenger"
                    onConnected={refreshAfterOauth}
                    onDisconnected={refreshAfterOauth}
                  />
                </div>
              </details>
            ) : null}
            <div className="flex items-center justify-between">
              <Label htmlFor="messenger-enabled">{t("notifications.messenger.settings.enabled")}</Label>
              <Switch
                id="messenger-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
              />
            </div>

            {oauthConnected ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  {t("notifications.messengerLogin.advancedManual", {
                    defaultValue: "Advanced: manual Page credentials",
                  })}
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t("notifications.messenger.settings.pageId")}</Label>
                    <Input
                      value={draft.pageId}
                      onChange={(event) => setDraft((prev) => ({ ...prev, pageId: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t("notifications.messenger.settings.accessToken")}</Label>
                    <Input
                      type="password"
                      value={draft.accessToken}
                      placeholder={settings?.hasAccessToken ? "********" : ""}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, accessToken: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("notifications.messenger.settings.apiVersion")}</Label>
                    <Input
                      value={draft.apiVersion}
                      placeholder="v21.0"
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, apiVersion: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t("notifications.messenger.settings.appSecret")}</Label>
                    <Input
                      type="password"
                      value={draft.appSecret}
                      placeholder={settings?.hasAppSecret ? "********" : ""}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, appSecret: event.target.value }))
                      }
                    />
                  </div>
                  <WebhookVerifyTokenField
                    id="messenger-webhook-verify-token"
                    label={t("notifications.messenger.settings.webhookVerifyToken")}
                    value={draft.webhookVerifyToken}
                    hasStoredToken={Boolean(settings?.hasWebhookVerifyToken)}
                    onChange={(webhookVerifyToken) =>
                      setDraft((prev) => ({ ...prev, webhookVerifyToken }))
                    }
                    onGenerate={onGenerateVerifyToken}
                    onRevealStored={
                      companyId && isMessengerApiConfigured()
                        ? async () => {
                            const revealed = await revealMessengerWebhookVerifyToken(companyId);
                            return revealed.webhookVerifyToken;
                          }
                        : undefined
                    }
                    hint={t("notifications.messenger.settings.webhookVerifyHint")}
                  />
                </div>
              </details>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("notifications.messenger.settings.pageId")}</Label>
                  <Input
                    value={draft.pageId}
                    onChange={(event) => setDraft((prev) => ({ ...prev, pageId: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("notifications.messenger.settings.accessToken")}</Label>
                  <Input
                    type="password"
                    value={draft.accessToken}
                    placeholder={settings?.hasAccessToken ? "********" : ""}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, accessToken: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("notifications.messenger.settings.apiVersion")}</Label>
                  <Input
                    value={draft.apiVersion}
                    placeholder="v21.0"
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, apiVersion: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("notifications.messenger.settings.appSecret")}</Label>
                  <Input
                    type="password"
                    value={draft.appSecret}
                    placeholder={settings?.hasAppSecret ? "********" : ""}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, appSecret: event.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("notifications.messenger.settings.appSecretHint")}
                  </p>
                </div>
                <WebhookVerifyTokenField
                  id="messenger-webhook-verify-token"
                  label={t("notifications.messenger.settings.webhookVerifyToken")}
                  value={draft.webhookVerifyToken}
                  hasStoredToken={Boolean(settings?.hasWebhookVerifyToken)}
                  onChange={(webhookVerifyToken) =>
                    setDraft((prev) => ({ ...prev, webhookVerifyToken }))
                  }
                  onGenerate={onGenerateVerifyToken}
                  onRevealStored={
                    companyId && isMessengerApiConfigured()
                      ? async () => {
                          const revealed = await revealMessengerWebhookVerifyToken(companyId);
                          return revealed.webhookVerifyToken;
                        }
                      : undefined
                  }
                  hint={t("notifications.messenger.settings.webhookVerifyHint")}
                />
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <Label>{t("notifications.messenger.settings.webhookUrl")}</Label>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("notifications.messenger.settings.webhookUrlGlobal", {
                      defaultValue: "Meta callback URL (recommended for Verify and save)",
                    })}
                  </p>
                  <Input readOnly value={globalWebhookUrl} />
                </div>
                {channelWebhookUrl ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("notifications.messenger.settings.webhookUrlChannel", {
                        defaultValue: "Channel-scoped URL (also valid after token reveal / pending setup)",
                      })}
                    </p>
                    <Input readOnly value={channelWebhookUrl} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("notifications.messenger.settings.webhookUrlChannelMissing")}{" "}
                    <Link href="/dashboard/channels" className="text-primary underline-offset-2 hover:underline">
                      {t("notifications.messenger.settings.openChannels")}
                    </Link>
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={onSave} disabled={updateSettings.isPending}>
                {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t("buttons.save")}
              </Button>
            </div>
          </>
        )}
      </DashboardCard>

      <DashboardCard className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{t("notifications.messenger.settings.healthTitle")}</h3>
        </div>

        {!isMessengerApiConfigured() ? (
          <p className="text-sm text-muted-foreground">{t("notifications.messenger.settings.apiMissing")}</p>
        ) : !companyChannelId ? (
          <p className="text-sm text-muted-foreground">
            {t("notifications.messenger.settings.channelRequired")}{" "}
            <Link href="/dashboard/channels" className="text-primary underline-offset-2 hover:underline">
              {t("notifications.messenger.settings.openChannels")}
            </Link>
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${health?.ok ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <span>
                {health?.ok
                  ? t("notifications.messenger.settings.healthOk", { ms: health.latencyMs })
                  : (() => {
                      const presentation = resolveMessengerHealthErrorPresentation(health?.error);
                      return presentation.descriptionKey
                        ? t(`notifications.messenger.settings.${presentation.descriptionKey}`)
                        : t("notifications.messenger.settings.healthFailed", {
                            error: presentation.fallbackDescription ?? health?.error ?? "—",
                          });
                    })()}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void refetchHealth()} disabled={healthLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {health?.page.name ? (
              <p className="text-xs text-muted-foreground">
                {t("notifications.messenger.settings.pageVerified", { name: health.page.name })}
              </p>
            ) : null}

            <Button
              variant="outline"
              onClick={onConnectionTest}
              disabled={connectionTest.isPending || !companyChannelId}
            >
              {connectionTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t("notifications.messenger.settings.connectionTest")}
            </Button>
          </>
        )}
      </DashboardCard>
    </div>
  );
}
