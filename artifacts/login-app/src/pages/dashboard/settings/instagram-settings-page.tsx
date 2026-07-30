import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Instagram, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { generateInstagramVerifyToken } from "@workspace/channel-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useInstagramCompanyChannel,
  useInstagramConnectionTest,
  useInstagramOutboundHealth,
  useInstagramSettings,
  useUpdateInstagramSettings,
} from "@/hooks/channels/use-instagram-settings";
import {
  buildInstagramChannelWebhookUrl,
  buildInstagramWebhookUrl,
  resolveChannelWebhookBaseUrl,
} from "@/lib/channels/whatsapp-channel-utils";
import { isInstagramApiConfigured, type InstagramSettingsDraft } from "@/lib/channels/instagram-settings";

const EMPTY_SETTINGS: InstagramSettingsDraft = {
  enabled: false,
  provider: "meta_instagram",
  pageId: "",
  instagramBusinessAccountId: "",
  accessToken: "",
  webhookVerifyToken: "",
  apiVersion: "v21.0",
  appSecret: "",
};

export function SettingsInstagramPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: settings, isLoading } = useInstagramSettings(companyId);
  const instagramChannel = useInstagramCompanyChannel(companyId);
  const companyChannelId = instagramChannel?.id ?? null;

  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = useInstagramOutboundHealth(
    companyId,
    companyChannelId,
  );
  const updateSettings = useUpdateInstagramSettings(companyId);
  const connectionTest = useInstagramConnectionTest(companyId, companyChannelId);

  const [draft, setDraft] = useState(EMPTY_SETTINGS);

  const webhookBaseUrl = resolveChannelWebhookBaseUrl();
  const globalWebhookUrl = useMemo(() => buildInstagramWebhookUrl(webhookBaseUrl), [webhookBaseUrl]);
  const channelWebhookUrl = useMemo(
    () => (companyChannelId ? buildInstagramChannelWebhookUrl(webhookBaseUrl, companyChannelId) : null),
    [webhookBaseUrl, companyChannelId],
  );

  useEffect(() => {
    if (settings) {
      setDraft({
        enabled: settings.enabled,
        provider: settings.provider,
        pageId: settings.pageId,
        instagramBusinessAccountId: settings.instagramBusinessAccountId,
        accessToken: settings.accessToken,
        webhookVerifyToken: settings.webhookVerifyToken,
        apiVersion: settings.apiVersion,
        appSecret: settings.appSecret,
      });
    }
  }, [settings]);

  const onSave = () => {
    updateSettings.mutate(draft, {
      onSuccess: () => toast({ title: t("notifications.instagram.settings.saved") }),
      onError: (error) =>
        toast({
          title: t("notifications.instagram.settings.saveFailed"),
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
          toast({ title: t("notifications.instagram.settings.connectionTestSuccess") });
        } else {
          toast({
            title: t("notifications.instagram.settings.connectionTestFailed"),
            description: result.error ?? t("notifications.instagram.settings.healthFailed", { error: "—" }),
            variant: "destructive",
          });
        }
        void refetchHealth();
      },
      onError: (error) =>
        toast({
          title: t("notifications.instagram.settings.connectionTestFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const onGenerateVerifyToken = () => {
    setDraft((prev) => ({ ...prev, webhookVerifyToken: generateInstagramVerifyToken() }));
  };

  const verifiedAccountLabel =
    health?.instagramAccount?.username ??
    health?.instagramAccount?.name ??
    null;

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
          <Instagram className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{t("notifications.instagram.settings.title")}</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("notifications.loading")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="instagram-enabled">{t("notifications.instagram.settings.enabled")}</Label>
              <Switch
                id="instagram-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.instagram.settings.instagramBusinessAccountId")}</Label>
                <Input
                  value={draft.instagramBusinessAccountId}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, instagramBusinessAccountId: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.instagram.settings.pageId")}</Label>
                <Input
                  value={draft.pageId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, pageId: event.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.instagram.settings.accessToken")}</Label>
                <Input
                  type="password"
                  value={draft.accessToken}
                  placeholder={settings?.hasAccessToken ? "********" : ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, accessToken: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.instagram.settings.apiVersion")}</Label>
                <Input
                  value={draft.apiVersion}
                  placeholder="v21.0"
                  onChange={(event) => setDraft((prev) => ({ ...prev, apiVersion: event.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.instagram.settings.appSecret")}</Label>
                <Input
                  type="password"
                  value={draft.appSecret}
                  placeholder={settings?.hasAppSecret ? "********" : ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, appSecret: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.instagram.settings.appSecretHint")}
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t("notifications.instagram.settings.webhookVerifyToken")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={onGenerateVerifyToken}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {t("notifications.instagram.settings.generateVerifyToken")}
                  </Button>
                </div>
                <Input
                  type="password"
                  value={draft.webhookVerifyToken}
                  placeholder={settings?.hasWebhookVerifyToken ? "********" : ""}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, webhookVerifyToken: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.instagram.settings.webhookVerifyHint")}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <Label>{t("notifications.instagram.settings.webhookUrl")}</Label>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("notifications.instagram.settings.webhookUrlGlobal")}
                  </p>
                  <Input readOnly value={globalWebhookUrl} />
                </div>
                {channelWebhookUrl ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("notifications.instagram.settings.webhookUrlChannel")}
                    </p>
                    <Input readOnly value={channelWebhookUrl} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("notifications.instagram.settings.webhookUrlChannelMissing")}{" "}
                    <Link href="/dashboard/channels" className="text-primary underline-offset-2 hover:underline">
                      {t("notifications.instagram.settings.openChannels")}
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
          <h3 className="font-semibold">{t("notifications.instagram.settings.healthTitle")}</h3>
        </div>

        {!isInstagramApiConfigured() ? (
          <p className="text-sm text-muted-foreground">{t("notifications.instagram.settings.apiMissing")}</p>
        ) : !companyChannelId ? (
          <p className="text-sm text-muted-foreground">
            {t("notifications.instagram.settings.channelRequired")}{" "}
            <Link href="/dashboard/channels" className="text-primary underline-offset-2 hover:underline">
              {t("notifications.instagram.settings.openChannels")}
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
                  ? t("notifications.instagram.settings.healthOk", { ms: health.latencyMs })
                  : t("notifications.instagram.settings.healthFailed", { error: health?.error ?? "—" })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void refetchHealth()} disabled={healthLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {verifiedAccountLabel ? (
              <p className="text-xs text-muted-foreground">
                {t("notifications.instagram.settings.accountVerified", { name: verifiedAccountLabel })}
              </p>
            ) : null}

            <Button
              variant="outline"
              onClick={onConnectionTest}
              disabled={connectionTest.isPending || !companyChannelId}
            >
              {connectionTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t("notifications.instagram.settings.connectionTest")}
            </Button>
          </>
        )}
      </DashboardCard>
    </div>
  );
}
