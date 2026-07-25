import { useEffect, useState } from "react";
import { Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
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
  useEmailConnectionTest,
  useEmailDeliverySummary,
  useEmailHealth,
  useEmailSettings,
  useProcessEmailQueue,
  useUpdateEmailSettings,
} from "@/hooks/notifications/use-email-health";
import { isEmailApiConfigured } from "@/lib/notifications/providers/email/services/email-api-client";
import type { CompanyEmailSettings, EmailEncryption } from "@/lib/notifications/providers/email/types/email-types";

const EMPTY_SETTINGS: Omit<CompanyEmailSettings, "companyId" | "hasPassword" | "updatedAt"> = {
  enabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpUsername: "",
  smtpPassword: "",
  smtpEncryption: "starttls",
  fromEmail: "",
  fromName: "",
  maxRetryCount: 3,
};

export function SettingsEmailPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: settings, isLoading } = useEmailSettings(companyId);
  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = useEmailHealth(companyId);
  const { data: deliverySummary } = useEmailDeliverySummary(companyId);
  const updateSettings = useUpdateEmailSettings(companyId);
  const testConnection = useEmailConnectionTest(companyId);
  const processQueue = useProcessEmailQueue(companyId);

  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [testRecipient, setTestRecipient] = useState("");

  useEffect(() => {
    if (settings) {
      setDraft({
        enabled: settings.enabled,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUsername: settings.smtpUsername,
        smtpPassword: settings.smtpPassword,
        smtpEncryption: settings.smtpEncryption,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
        maxRetryCount: settings.maxRetryCount,
      });
    }
  }, [settings]);

  const onSave = () => {
    updateSettings.mutate(draft, {
      onSuccess: () => toast({ title: t("notifications.email.settings.saved") }),
      onError: (error) =>
        toast({ title: t("notifications.email.settings.saveFailed"), description: error.message, variant: "destructive" }),
    });
  };

  const onTest = () => {
    if (!testRecipient.trim()) return;
    testConnection.mutate(testRecipient.trim(), {
      onSuccess: () => toast({ title: t("notifications.email.settings.testSuccess") }),
      onError: (error) =>
        toast({ title: t("notifications.email.settings.testFailed"), description: error.message, variant: "destructive" }),
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
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{t("notifications.email.settings.title")}</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("notifications.loading")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="email-enabled">{t("notifications.email.settings.enabled")}</Label>
              <Switch
                id="email-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("notifications.email.settings.smtpHost")}</Label>
                <Input
                  value={draft.smtpHost}
                  onChange={(event) => setDraft((prev) => ({ ...prev, smtpHost: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.email.settings.smtpPort")}</Label>
                <Input
                  type="number"
                  value={draft.smtpPort}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, smtpPort: Number(event.target.value) || 587 }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.email.settings.username")}</Label>
                <Input
                  value={draft.smtpUsername}
                  onChange={(event) => setDraft((prev) => ({ ...prev, smtpUsername: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.email.settings.password")}</Label>
                <Input
                  type="password"
                  value={draft.smtpPassword}
                  placeholder={settings?.hasPassword ? "********" : ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, smtpPassword: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.email.settings.encryption")}</Label>
                <Select
                  value={draft.smtpEncryption}
                  onValueChange={(value) =>
                    setDraft((prev) => ({ ...prev, smtpEncryption: value as EmailEncryption }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starttls">{t("notifications.email.settings.encryptionStartTls")}</SelectItem>
                    <SelectItem value="ssl">{t("notifications.email.settings.encryptionSsl")}</SelectItem>
                    <SelectItem value="none">{t("notifications.email.settings.encryptionNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("notifications.email.settings.fromEmail")}</Label>
                <Input
                  value={draft.fromEmail}
                  onChange={(event) => setDraft((prev) => ({ ...prev, fromEmail: event.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("notifications.email.settings.fromName")}</Label>
                <Input
                  value={draft.fromName}
                  onChange={(event) => setDraft((prev) => ({ ...prev, fromName: event.target.value }))}
                />
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
          <h3 className="font-semibold">{t("notifications.email.settings.healthTitle")}</h3>
        </div>

        {!isEmailApiConfigured() ? (
          <p className="text-sm text-muted-foreground">{t("notifications.email.settings.apiMissing")}</p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${health?.ok ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <span>
                {health?.ok
                  ? t("notifications.email.settings.healthOk", { ms: health.latencyMs })
                  : t("notifications.email.settings.healthFailed", { error: health?.error ?? "—" })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void refetchHealth()} disabled={healthLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("notifications.email.settings.testRecipient")}</Label>
                <Input value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={onTest} disabled={testConnection.isPending}>
                  {testConnection.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t("notifications.email.settings.testConnection")}
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
                      title: t("notifications.email.settings.queueProcessed", {
                        completed: (result as { completed?: number }).completed ?? 0,
                      }),
                    }),
                })
              }
            >
              {t("notifications.email.settings.processQueue")}
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
