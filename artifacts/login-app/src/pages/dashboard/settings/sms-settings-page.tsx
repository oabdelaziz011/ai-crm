import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, MessageSquareText, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useSmsCompanyChannel,
  useSmsConnectionTest,
  useSmsSettings,
  useUpdateSmsSettings,
} from "@/hooks/channels/use-sms-settings";
import {
  buildSmsWebhookUrl,
  resolveChannelWebhookBaseUrl,
} from "@/lib/channels/whatsapp-channel-utils";
import {
  isSmsApiConfigured,
  resolveSmsConnectionStatus,
  type SmsProviderKind,
  type SmsSettingsDraft,
} from "@/lib/channels/sms-settings";

const EMPTY_SETTINGS: SmsSettingsDraft = {
  enabled: false,
  provider: "",
  accountSid: "",
  fromNumber: "",
  authToken: "",
};

export function SettingsSmsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: settings, isLoading } = useSmsSettings(companyId);
  const smsChannel = useSmsCompanyChannel(companyId);
  const updateSettings = useUpdateSmsSettings(companyId);
  const connectionTest = useSmsConnectionTest(companyId);

  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [latestTestOk, setLatestTestOk] = useState<boolean | null>(null);

  const webhookBaseUrl = resolveChannelWebhookBaseUrl();
  const webhookUrl = useMemo(() => buildSmsWebhookUrl(webhookBaseUrl), [webhookBaseUrl]);

  useEffect(() => {
    if (!settings) return;
    setDraft((prev) => ({
      enabled: settings.enabled,
      provider: settings.provider,
      accountSid: settings.accountSid,
      fromNumber: settings.fromNumber,
      // Never reload masked RPC values into secret inputs (WhatsApp pattern).
      authToken: prev.authToken,
    }));
    setLatestTestOk(null);
  }, [settings]);

  const connectionStatus = resolveSmsConnectionStatus(settings);
  const displayStatus =
    connectionStatus.status === "disabled"
      ? "disabled"
      : latestTestOk === true && connectionStatus.status === "connected"
        ? "connected"
        : connectionStatus.status === "connected" && latestTestOk === false
          ? "not_connected"
          : connectionStatus.status === "connected"
            ? "not_connected" // configured but not verified — do not fake Connected
            : "not_connected";

  const onSave = () => {
    updateSettings.mutate(draft, {
      onSuccess: () => {
        setDraft((prev) => ({ ...prev, authToken: "" }));
        setLatestTestOk(null);
        toast({ title: t("notifications.sms.settings.saved") });
      },
      onError: (error) =>
        toast({
          title: t("notifications.sms.settings.saveFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const onConnectionTest = () => {
    connectionTest.mutate(undefined, {
      onSuccess: (result) => {
        setLatestTestOk(result.ok);
        if (result.ok) {
          toast({ title: t("notifications.sms.settings.connectionTestSuccess") });
        } else {
          toast({
            title: t("notifications.sms.settings.connectionTestFailed"),
            description:
              result.error ??
              t("notifications.sms.settings.healthFailed", { error: result.reason ?? "—" }),
            variant: "destructive",
          });
        }
      },
      onError: (error) => {
        setLatestTestOk(false);
        toast({
          title: t("notifications.sms.settings.connectionTestFailed"),
          description: error.message,
          variant: "destructive",
        });
      },
    });
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
      <DashboardCard className="p-6 space-y-5" data-testid="sms-settings-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">{t("notifications.sms.settings.title")}</h3>
          </div>
          <div className="text-xs text-muted-foreground" data-testid="sms-connection-status">
            {t(`notifications.sms.settings.status.${displayStatus}`)}
            {connectionStatus.provider
              ? ` · ${t(`notifications.sms.settings.providers.${connectionStatus.provider}`, {
                  defaultValue: connectionStatus.provider,
                })}`
              : ""}
            {connectionStatus.fromNumber ? ` · ${connectionStatus.fromNumber}` : ""}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("notifications.loading")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="sms-enabled">{t("notifications.sms.settings.enabled")}</Label>
              <Switch
                id="sms-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.sms.settings.provider")}</Label>
                <Select
                  value={draft.provider || "none"}
                  onValueChange={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      provider: (value === "none" ? "" : value) as SmsProviderKind,
                    }))
                  }
                >
                  <SelectTrigger data-testid="sms-provider-select">
                    <SelectValue placeholder={t("notifications.sms.settings.providerPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t("notifications.sms.settings.providerNone")}
                    </SelectItem>
                    <SelectItem value="twilio">
                      {t("notifications.sms.settings.providers.twilio")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {!draft.provider ? (
                  <p className="text-xs text-muted-foreground">
                    {t("notifications.sms.settings.providerBoundary")}
                  </p>
                ) : null}
              </div>

              {draft.provider === "twilio" ? (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t("notifications.sms.settings.accountSid")}</Label>
                    <Input
                      value={draft.accountSid}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, accountSid: event.target.value }))
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t("notifications.sms.settings.fromNumber")}</Label>
                    <Input
                      value={draft.fromNumber}
                      placeholder="+15551234567"
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, fromNumber: event.target.value }))
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t("notifications.sms.settings.authToken")}</Label>
                    <Input
                      type="password"
                      value={draft.authToken}
                      placeholder={settings?.hasAuthToken ? "********" : ""}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, authToken: event.target.value }))
                      }
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("notifications.sms.settings.authTokenHint")}
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <Label>{t("notifications.sms.settings.webhookUrl")}</Label>
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">
                {t("notifications.sms.settings.webhookUrlHelp")}
                {!smsChannel ? (
                  <>
                    {" "}
                    <Link
                      href="/dashboard/channels"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {t("notifications.sms.settings.openChannels")}
                    </Link>
                  </>
                ) : null}
              </p>
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
          <h3 className="font-semibold">{t("notifications.sms.settings.healthTitle")}</h3>
        </div>

        {!isSmsApiConfigured() ? (
          <p className="text-sm text-muted-foreground">{t("notifications.sms.settings.apiMissing")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {latestTestOk === true
                ? t("notifications.sms.settings.healthOk", {
                    ms: connectionTest.data?.latencyMs ?? 0,
                  })
                : latestTestOk === false
                  ? t("notifications.sms.settings.healthFailed", {
                      error: connectionTest.data?.error ?? "—",
                    })
                  : t("notifications.sms.settings.healthIdle")}
            </p>

            <Button
              variant="outline"
              onClick={onConnectionTest}
              disabled={connectionTest.isPending}
              data-testid="sms-test-connection"
            >
              {connectionTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t("notifications.sms.settings.connectionTest")}
            </Button>
          </>
        )}
      </DashboardCard>
    </div>
  );
}
