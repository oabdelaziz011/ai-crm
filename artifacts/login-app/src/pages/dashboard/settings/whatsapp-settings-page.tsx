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
  useWhatsAppDeliverySummary,
  useWhatsAppHealth,
  useWhatsAppSettings,
  useWhatsAppTestMessage,
} from "@/hooks/notifications/use-whatsapp-health";
import { isWhatsAppApiConfigured } from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import type {
  CompanyWhatsAppSettings,
  WhatsAppProviderKind,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

const EMPTY_SETTINGS: Omit<
  CompanyWhatsAppSettings,
  "companyId" | "hasAccessToken" | "hasWebhookVerifyToken" | "hasAppSecret" | "updatedAt"
> = {
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

export function SettingsWhatsAppPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: settings, isLoading } = useWhatsAppSettings(companyId);
  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = useWhatsAppHealth(companyId);
  const { data: deliverySummary } = useWhatsAppDeliverySummary(companyId);
  const updateSettings = useUpdateWhatsAppSettings(companyId);
  const testMessage = useWhatsAppTestMessage(companyId);
  const processQueue = useProcessWhatsAppQueue(companyId);

  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [testRecipient, setTestRecipient] = useState("");

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
            <div className="flex items-center gap-3 text-sm">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${health?.ok ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <span>
                {health?.ok
                  ? t("notifications.whatsapp.settings.healthOk", { ms: health.latencyMs })
                  : t("notifications.whatsapp.settings.healthFailed", { error: health?.error ?? "—" })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void refetchHealth()} disabled={healthLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

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
