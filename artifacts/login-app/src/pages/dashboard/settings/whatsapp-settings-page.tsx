import { useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
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
  useProcessWhatsAppQueue,
  useUpdateWhatsAppSettings,
  useWhatsAppConnectionTest,
  useWhatsAppDeliverySummary,
  useWhatsAppHealth,
  useWhatsAppSettings,
  useWhatsAppTestMessage,
} from "@/hooks/notifications/use-whatsapp-health";
import { isWhatsAppApiConfigured } from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import type { WhatsAppSettingsDraft } from "@/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
import type {
  WhatsAppProviderKind,
  WhatsAppTokenStatus,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

const EMPTY_SETTINGS: WhatsAppSettingsDraft = {
  enabled: false,
  provider: "meta_cloud",
  accessToken: "",
  phoneNumberId: "",
  businessAccountId: "",
  webhookVerifyToken: "",
  apiVersion: "v21.0",
  appSecret: "",
  defaultLanguage: "en",
  maxRetryCount: 3,
};

function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function tokenStatusTone(status: WhatsAppTokenStatus | undefined): string {
  switch (status) {
    case "valid":
      return "bg-emerald-400";
    case "expired":
    case "invalid":
    case "missing":
      return "bg-rose-400";
    default:
      return "bg-amber-400";
  }
}

export function SettingsWhatsAppPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: settings, isLoading } = useWhatsAppSettings(companyId);
  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = useWhatsAppHealth(companyId);
  const { data: deliverySummary } = useWhatsAppDeliverySummary(companyId);
  const updateSettings = useUpdateWhatsAppSettings(companyId);
  const connectionTest = useWhatsAppConnectionTest(companyId);
  const testMessage = useWhatsAppTestMessage(companyId);
  const processQueue = useProcessWhatsAppQueue(companyId);

  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [testRecipient, setTestRecipient] = useState("");
  /** Latest Test Connection outcome — Provider Health card source of truth after a test. */
  const [latestConnectionTest, setLatestConnectionTest] = useState<{
    ok: boolean;
    latencyMs: number;
    error: string | null;
    tokenStatus: WhatsAppTokenStatus;
  } | null>(null);

  useEffect(() => {
    if (settings) {
      setDraft({
        enabled: settings.enabled,
        provider: settings.provider,
        accessToken: settings.accessToken,
        phoneNumberId: settings.phoneNumberId,
        businessAccountId: settings.businessAccountId,
        webhookVerifyToken: settings.webhookVerifyToken,
        apiVersion: settings.apiVersion,
        appSecret: settings.appSecret,
        defaultLanguage: settings.defaultLanguage,
        maxRetryCount: settings.maxRetryCount,
      });
    }
  }, [settings]);

  const onSave = () => {
    updateSettings.mutate(draft, {
      onSuccess: () => toast({ title: t("notifications.whatsapp.settings.saved") }),
      onError: (error) =>
        toast({
          title: t("notifications.whatsapp.settings.saveFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const describeConnectionError = (raw: string | undefined) => {
    if (!raw) return t("notifications.whatsapp.settings.connectionTestFailed");
    if (/failed to fetch|cannot reach whatsapp api|networkerror|load failed/i.test(raw)) {
      return t("notifications.whatsapp.settings.apiUnreachable");
    }
    return raw;
  };

  const onConnectionTest = () => {
    setLatestConnectionTest(null);
    connectionTest.mutate(undefined, {
      onSuccess: (report) => {
        if (report.ok) {
          setLatestConnectionTest({
            ok: true,
            latencyMs: report.latencyMs,
            error: null,
            tokenStatus: report.tokenStatus === "unknown" ? "valid" : report.tokenStatus,
          });
          toast({ title: t("notifications.whatsapp.settings.connectionTestSuccess") });
          return;
        }
        const detail = describeConnectionError(
          report.error ?? t("notifications.whatsapp.settings.connectionTestFailed"),
        );
        setLatestConnectionTest({
          ok: false,
          latencyMs: report.latencyMs,
          error: detail,
          tokenStatus: report.tokenStatus,
        });
        toast({
          title: t("notifications.whatsapp.settings.connectionTestFailed"),
          description: detail,
          variant: "destructive",
        });
      },
      onError: (error) => {
        const detail = describeConnectionError(error.message);
        setLatestConnectionTest({
          ok: false,
          latencyMs: 0,
          error: detail,
          tokenStatus: "unknown",
        });
        toast({
          title: t("notifications.whatsapp.settings.connectionTestFailed"),
          description: detail,
          variant: "destructive",
        });
      },
    });
  };

  const onTest = () => {
    if (!testRecipient.trim()) return;
    testMessage.mutate(testRecipient.trim(), {
      onSuccess: () => toast({ title: t("notifications.whatsapp.settings.testSuccess") }),
      onError: (error) =>
        toast({
          title: t("notifications.whatsapp.settings.testFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const tokenStatus = latestConnectionTest?.tokenStatus ?? settings?.tokenStatus ?? "unknown";
  const lastAuthError =
    latestConnectionTest?.ok === true
      ? null
      : (latestConnectionTest?.error ?? settings?.lastAuthError ?? null);
  const showCredentialWarning =
    latestConnectionTest?.ok !== true &&
    (tokenStatus === "expired" || tokenStatus === "invalid" || tokenStatus === "missing");

  const healthOk = latestConnectionTest ? latestConnectionTest.ok : Boolean(health?.ok);
  const healthLatencyMs = latestConnectionTest?.latencyMs ?? health?.latencyMs ?? 0;
  const healthError =
    latestConnectionTest?.ok === false
      ? latestConnectionTest.error
      : latestConnectionTest?.ok === true
        ? null
        : (health?.error ?? null);

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
          <MessageCircle className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{t("notifications.whatsapp.settings.title")}</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("notifications.loading")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="whatsapp-enabled">{t("notifications.whatsapp.settings.enabled")}</Label>
              <Switch
                id="whatsapp-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.provider")}</Label>
                <Select
                  value={draft.provider}
                  onValueChange={(value) =>
                    setDraft((prev) => ({ ...prev, provider: value as WhatsAppProviderKind }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta_cloud">
                      {t("notifications.whatsapp.settings.providerMetaCloud")}
                    </SelectItem>
                    <SelectItem value="twilio" disabled>
                      {t("notifications.whatsapp.settings.providerTwilio")}
                    </SelectItem>
                    <SelectItem value="360dialog" disabled>
                      {t("notifications.whatsapp.settings.provider360Dialog")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.defaultLanguage")}</Label>
                <Select
                  value={draft.defaultLanguage}
                  onValueChange={(value) => setDraft((prev) => ({ ...prev, defaultLanguage: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.whatsapp.settings.accessToken")}</Label>
                <Input
                  type="password"
                  value={draft.accessToken}
                  placeholder={settings?.hasAccessToken ? "********" : ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, accessToken: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.phoneNumberId")}</Label>
                <Input
                  value={draft.phoneNumberId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, phoneNumberId: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.businessAccountId")}</Label>
                <Input
                  value={draft.businessAccountId}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, businessAccountId: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.apiVersion")}</Label>
                <Input
                  value={draft.apiVersion}
                  placeholder="v21.0"
                  onChange={(event) => setDraft((prev) => ({ ...prev, apiVersion: event.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.whatsapp.settings.appSecret")}</Label>
                <Input
                  type="password"
                  value={draft.appSecret}
                  placeholder={settings?.hasAppSecret ? "********" : ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, appSecret: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.appSecretHint")}
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.whatsapp.settings.webhookVerifyToken")}</Label>
                <Input
                  type="password"
                  value={draft.webhookVerifyToken}
                  placeholder={settings?.hasWebhookVerifyToken ? "********" : ""}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, webhookVerifyToken: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.webhookFutureHint")}
                </p>
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
          <h3 className="font-semibold">{t("notifications.whatsapp.settings.healthTitle")}</h3>
        </div>

        {!isWhatsAppApiConfigured() ? (
          <p className="text-sm text-muted-foreground">{t("notifications.whatsapp.settings.apiMissing")}</p>
        ) : (
          <>
            {showCredentialWarning ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {t("notifications.whatsapp.settings.credentialWarning", {
                  status: t(`notifications.whatsapp.settings.tokenStatus.${tokenStatus}`),
                })}
                {lastAuthError ? (
                  <p className="mt-1 text-xs text-rose-300/90">{lastAuthError}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.tokenStatusLabel")}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-2.5 w-2.5 rounded-full ${tokenStatusTone(tokenStatus)}`} />
                  <span>{t(`notifications.whatsapp.settings.tokenStatus.${tokenStatus}`)}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.tokenExpiresAt")}
                </p>
                <p>{formatDateTime(settings?.tokenExpiresAt, i18n.language)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.lastSuccessfulSend")}
                </p>
                <p>{formatDateTime(settings?.lastSuccessfulSendAt, i18n.language)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.lastAuthError")}
                </p>
                <p className={lastAuthError ? "text-rose-300" : undefined}>
                  {lastAuthError?.trim() || "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${healthOk ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <span className={healthOk ? "text-emerald-300" : "text-rose-300"}>
                {healthOk
                  ? t("notifications.whatsapp.settings.healthOk", { ms: healthLatencyMs })
                  : t("notifications.whatsapp.settings.healthFailed", {
                      error: healthError?.trim() || "—",
                    })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLatestConnectionTest(null);
                  void refetchHealth();
                }}
                disabled={healthLoading}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={onConnectionTest}
              disabled={connectionTest.isPending}
            >
              {connectionTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t("notifications.whatsapp.settings.connectionTest")}
            </Button>

            {latestConnectionTest?.ok === false && latestConnectionTest.error ? (
              <p className="text-xs text-rose-400 whitespace-pre-wrap">{latestConnectionTest.error}</p>
            ) : null}
            {latestConnectionTest?.ok === true ? (
              <p className="text-xs text-emerald-400">
                {t("notifications.whatsapp.settings.connectionTestSuccess")}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.testRecipient")}</Label>
                <Input
                  value={testRecipient}
                  placeholder="+966500000000"
                  onChange={(event) => setTestRecipient(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={onTest} disabled={testMessage.isPending}>
                  {testMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t("notifications.whatsapp.settings.testMessage")}
                </Button>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              disabled={processQueue.isPending}
              onClick={() =>
                processQueue.mutate(undefined, {
                  onSuccess: (result) =>
                    toast({
                      title: t("notifications.whatsapp.settings.queueProcessed", {
                        completed: (result as { completed?: number }).completed ?? 0,
                      }),
                    }),
                })
              }
            >
              {t("notifications.whatsapp.settings.processQueue")}
            </Button>

            {deliverySummary?.lastError ? (
              <p className="text-xs text-rose-400">{deliverySummary.lastError}</p>
            ) : null}
          </>
        )}
      </DashboardCard>
    </div>
  );
}
