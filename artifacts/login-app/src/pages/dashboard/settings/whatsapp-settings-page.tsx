import { useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
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
  whatsappSettingsKey,
} from "@/hooks/notifications/use-whatsapp-health";
import { isWhatsAppApiConfigured } from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import { resolveWhatsAppSettingsAuthError } from "@/lib/notifications/providers/whatsapp/services/whatsapp-delivery-log-repository";
import type { WhatsAppSettingsDraft } from "@/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
import type {
  WhatsAppProviderKind,
  WhatsAppTokenStatus,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";
import {
  buildWhatsAppWebhookUrl,
  resolveChannelWebhookBaseUrl,
} from "@/lib/channels/whatsapp-channel-utils";
import { WhatsAppEmbeddedSignupPanel } from "@/components/channels/whatsapp-embedded-signup-panel";
import { isWhatsAppEmbeddedSignupUiEnabled } from "@/lib/channels/whatsapp-embedded-signup-flags";

const EMPTY_SETTINGS: WhatsAppSettingsDraft = {
  enabled: false,
  provider: "meta_cloud",
  accessToken: "",
  phoneNumberId: "",
  businessAccountId: "",
  webhookVerifyToken: "",
  apiVersion: "v21.0",
  appSecret: "",
  webhookCallbackUrl: "",
  defaultLanguage: "en",
  maxRetryCount: 3,
};

function defaultWebhookCallbackUrl(): string {
  return buildWhatsAppWebhookUrl(resolveChannelWebhookBaseUrl());
}

function resolveInitialWebhookCallbackUrl(saved: string | null | undefined): string {
  const trimmed = (saved ?? "").trim();
  return trimmed || defaultWebhookCallbackUrl();
}

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
  const queryClient = useQueryClient();
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
  const [webhookCallbackUrl, setWebhookCallbackUrl] = useState(defaultWebhookCallbackUrl);
  const [webhookCallbackUrlError, setWebhookCallbackUrlError] = useState<string | null>(null);
  /** Latest Test Connection outcome — Provider Health card source of truth after a test. */
  const [latestConnectionTest, setLatestConnectionTest] = useState<{
    ok: boolean;
    latencyMs: number;
    error: string | null;
    tokenStatus: WhatsAppTokenStatus;
  } | null>(null);

  useEffect(() => {
    if (!settings) return;
    const callbackUrl = resolveInitialWebhookCallbackUrl(settings.webhookCallbackUrl);
    setWebhookCallbackUrl(callbackUrl);
    setWebhookCallbackUrlError(null);
    setDraft((prev) => ({
      enabled: settings.enabled,
      provider: settings.provider,
      // Keep in-progress secret edits; never reload masked RPC values into the inputs.
      accessToken: prev.accessToken,
      phoneNumberId: settings.phoneNumberId,
      businessAccountId: settings.businessAccountId,
      webhookVerifyToken: prev.webhookVerifyToken,
      apiVersion: settings.apiVersion,
      appSecret: prev.appSecret,
      webhookCallbackUrl: callbackUrl,
      defaultLanguage: settings.defaultLanguage,
      maxRetryCount: settings.maxRetryCount,
    }));
  }, [settings]);

  const onSave = () => {
    const trimmedCallback = webhookCallbackUrl.trim();
    if (!trimmedCallback) {
      setWebhookCallbackUrlError(t("notifications.whatsapp.settings.webhookCallbackUrlRequired"));
      return;
    }
    try {
      const parsed = new URL(trimmedCallback);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setWebhookCallbackUrlError(t("notifications.whatsapp.settings.webhookCallbackUrlInvalid"));
        return;
      }
    } catch {
      setWebhookCallbackUrlError(t("notifications.whatsapp.settings.webhookCallbackUrlInvalid"));
      return;
    }
    setWebhookCallbackUrlError(null);

    updateSettings.mutate(
      { ...draft, webhookCallbackUrl: trimmedCallback },
      {
        onSuccess: () => {
          setDraft((prev) => ({
            ...prev,
            accessToken: "",
            webhookVerifyToken: "",
            appSecret: "",
            webhookCallbackUrl: trimmedCallback,
          }));
          setWebhookCallbackUrl(trimmedCallback);
          toast({ title: t("notifications.whatsapp.settings.saved") });
        },
        onError: (error) =>
          toast({
            title: t("notifications.whatsapp.settings.saveFailed"),
            description: error.message,
            variant: "destructive",
          }),
      },
    );
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
          const fp = report.diagnostics?.tokenFingerprint;
          console.info("[whatsapp.settings.test-connection]", {
            at: report.diagnostics?.checkedAt ?? new Date().toISOString(),
            companyId,
            phoneNumberId: report.diagnostics?.phoneNumberId ?? null,
            tokenSource: report.diagnostics?.tokenSource ?? null,
            tokenFrom: report.diagnostics?.tokenFrom ?? null,
            tokenLength: fp?.length ?? null,
            tokenFingerprint: fp?.sha256_12 ?? null,
            tokenPrefix: fp?.prefix ?? null,
            ok: true,
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
        const fp = report.diagnostics?.tokenFingerprint;
        console.info("[whatsapp.settings.test-connection]", {
          at: report.diagnostics?.checkedAt ?? new Date().toISOString(),
          companyId,
          phoneNumberId: report.diagnostics?.phoneNumberId ?? null,
          tokenSource: report.diagnostics?.tokenSource ?? null,
          tokenFrom: report.diagnostics?.tokenFrom ?? null,
          tokenLength: fp?.length ?? null,
          tokenFingerprint: fp?.sha256_12 ?? null,
          tokenPrefix: fp?.prefix ?? null,
          ok: false,
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

  const tokenStatus: WhatsAppTokenStatus = (() => {
    if (latestConnectionTest) return latestConnectionTest.tokenStatus;
    // Prefer live health over the stored lifecycle column (can remain "valid" after Graph expiry).
    if (health && health.ok === false) {
      const err = String(health.error ?? "");
      if (/session has expired|token.*(expired|expire)|error validating access token/i.test(err)) {
        return "expired";
      }
      return "invalid";
    }
    return settings?.tokenStatus ?? "unknown";
  })();
  const lastAuthError = resolveWhatsAppSettingsAuthError({
    settingsLastAuthError: settings?.lastAuthError,
    latestConnectionTest,
    healthOk: health?.ok,
    healthError: health?.error ?? null,
  });
  const healthOk = latestConnectionTest ? latestConnectionTest.ok : Boolean(health?.ok);
  const healthLatencyMs = latestConnectionTest?.latencyMs ?? health?.latencyMs ?? 0;
  const healthError =
    latestConnectionTest?.ok === false
      ? latestConnectionTest.error
      : latestConnectionTest?.ok === true
        ? null
        : (health?.error ?? null);
  // Stored token_status can stay "valid" after the encrypted secret expires.
  // Prefer live Test Connection / health probe over the lifecycle column alone.
  const providerDisabled =
    !draft.enabled ||
    health?.enabled === false ||
    /whatsapp provider is disabled/i.test(String(healthError ?? lastAuthError ?? ""));
  // Credential/auth failures — not the intentional "disabled" configuration state.
  const showCredentialWarning =
    !providerDisabled &&
    (latestConnectionTest?.ok === false ||
      (latestConnectionTest == null && health?.ok === false) ||
      tokenStatus === "expired" ||
      tokenStatus === "invalid" ||
      tokenStatus === "missing");
  const storedStatusMayBeStale =
    !providerDisabled &&
    (settings?.tokenStatus === "valid" || settings?.tokenStatus === "unknown") &&
    ((latestConnectionTest == null && health?.ok === false) ||
      latestConnectionTest?.ok === false);

  const onWebhookCallbackUrlChange = (value: string) => {
    setWebhookCallbackUrl(value);
    setDraft((prev) => ({ ...prev, webhookCallbackUrl: value }));
    const trimmed = value.trim();
    if (!trimmed) {
      setWebhookCallbackUrlError(t("notifications.whatsapp.settings.webhookCallbackUrlRequired"));
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setWebhookCallbackUrlError(t("notifications.whatsapp.settings.webhookCallbackUrlInvalid"));
        return;
      }
      setWebhookCallbackUrlError(null);
    } catch {
      setWebhookCallbackUrlError(t("notifications.whatsapp.settings.webhookCallbackUrlInvalid"));
    }
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
      {isWhatsAppEmbeddedSignupUiEnabled() ? (
        <WhatsAppEmbeddedSignupPanel
          companyId={companyId}
          onCompleted={() => {
            void queryClient.invalidateQueries({ queryKey: whatsappSettingsKey(companyId) });
            void refetchHealth();
          }}
        />
      ) : null}

      <DashboardCard className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{t("notifications.whatsapp.settings.title")}</h3>
        </div>

        {isWhatsAppEmbeddedSignupUiEnabled() ? (
          <p className="text-sm text-muted-foreground">
            {t("notifications.whatsapp.settings.embeddedSignup.manualSectionLabel")}
          </p>
        ) : null}

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
                  autoComplete="new-password"
                  placeholder={
                    settings?.hasAccessToken
                      ? t("notifications.whatsapp.settings.secretKeepPlaceholder")
                      : ""
                  }
                  onChange={(event) => setDraft((prev) => ({ ...prev, accessToken: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.accessTokenHint")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.secretLeaveBlankHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.phoneNumberId")}</Label>
                <Input
                  value={draft.phoneNumberId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, phoneNumberId: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.phoneNumberIdHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.whatsapp.settings.businessAccountId")}</Label>
                <Input
                  value={draft.businessAccountId}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, businessAccountId: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.businessAccountIdHint")}
                </p>
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
                  autoComplete="new-password"
                  placeholder={
                    settings?.hasAppSecret
                      ? t("notifications.whatsapp.settings.secretKeepPlaceholder")
                      : ""
                  }
                  onChange={(event) => setDraft((prev) => ({ ...prev, appSecret: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.appSecretHint")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.secretLeaveBlankHint")}
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.whatsapp.settings.webhookVerifyToken")}</Label>
                <Input
                  type="password"
                  value={draft.webhookVerifyToken}
                  autoComplete="new-password"
                  placeholder={
                    settings?.hasWebhookVerifyToken
                      ? t("notifications.whatsapp.settings.secretKeepPlaceholder")
                      : ""
                  }
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, webhookVerifyToken: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.webhookVerifyHint")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.secretLeaveBlankHint")}
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="whatsapp-webhook-callback-url">
                  {t("notifications.whatsapp.settings.webhookCallbackUrl")}
                </Label>
                <Input
                  id="whatsapp-webhook-callback-url"
                  type="url"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={webhookCallbackUrl}
                  aria-invalid={Boolean(webhookCallbackUrlError)}
                  onChange={(event) => onWebhookCallbackUrlChange(event.target.value)}
                />
                {webhookCallbackUrlError ? (
                  <p className="text-xs text-destructive">{webhookCallbackUrlError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("notifications.whatsapp.settings.webhookCallbackHint")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("notifications.whatsapp.settings.channelRequiredHint")}
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
            {providerDisabled ? (
              <div
                role="status"
                className="rounded-md border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/50 dark:text-amber-50"
              >
                <p className="font-medium break-words">
                  {t("notifications.whatsapp.settings.providerDisabledTitle")}
                </p>
                <p className="mt-1 text-xs break-words text-amber-900 dark:text-amber-100">
                  {t("notifications.whatsapp.settings.providerDisabledHint")}
                </p>
              </div>
            ) : null}

            {showCredentialWarning ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:border-rose-400/50 dark:bg-rose-950/50 dark:text-rose-50"
              >
                <p className="font-medium break-words">
                  {t("notifications.whatsapp.settings.credentialWarning", {
                    status: t(`notifications.whatsapp.settings.tokenStatus.${tokenStatus}`),
                  })}
                </p>
                {lastAuthError ? (
                  <p className="mt-1 text-xs break-words whitespace-pre-wrap text-destructive dark:text-rose-100">
                    {lastAuthError}
                  </p>
                ) : null}
                {storedStatusMayBeStale ? (
                  <p className="mt-1 text-xs break-words text-amber-800 dark:text-amber-200">
                    {t("notifications.whatsapp.settings.tokenStatusStaleHint")}
                  </p>
                ) : null}
                <p className="mt-2 text-xs break-words text-destructive/90 dark:text-rose-100">
                  {t("notifications.whatsapp.settings.credentialRemediation")}
                </p>
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
                <p
                  className={
                    lastAuthError && !providerDisabled
                      ? "break-words whitespace-pre-wrap text-destructive dark:text-rose-200"
                      : "break-words"
                  }
                >
                  {providerDisabled
                    ? "—"
                    : lastAuthError?.trim() || "—"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <span
                className={`mt-1.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                  providerDisabled ? "bg-amber-500" : healthOk ? "bg-emerald-500" : "bg-destructive"
                }`}
              />
              <span
                className={`min-w-0 flex-1 break-words whitespace-pre-wrap ${
                  providerDisabled
                    ? "text-amber-900 dark:text-amber-100"
                    : healthOk
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-destructive dark:text-rose-200"
                }`}
              >
                {providerDisabled
                  ? t("notifications.whatsapp.settings.providerDisabledTitle")
                  : healthOk
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
              <p className="text-xs break-words whitespace-pre-wrap text-destructive dark:text-rose-200">
                {latestConnectionTest.error}
              </p>
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

            {deliverySummary?.lastDeliveryStatus === "failed" &&
            deliverySummary.lastDeliveryError?.trim() ? (
              <p className="text-xs break-words whitespace-pre-wrap text-muted-foreground">
                {t("notifications.whatsapp.settings.lastDeliveryFailed", {
                  error: deliverySummary.lastDeliveryError.trim(),
                  when: formatDateTime(deliverySummary.lastDeliveryAt, i18n.language),
                })}
              </p>
            ) : deliverySummary?.lastDeliveryStatus === "completed" &&
              deliverySummary.lastDeliveryAt ? (
              <p className="text-xs text-muted-foreground">
                {t("notifications.whatsapp.settings.lastDeliverySucceeded", {
                  when: formatDateTime(deliverySummary.lastDeliveryAt, i18n.language),
                })}
              </p>
            ) : null}
          </>
        )}
      </DashboardCard>
    </div>
  );
}
