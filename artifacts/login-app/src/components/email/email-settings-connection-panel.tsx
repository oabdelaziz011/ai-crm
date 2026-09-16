/**
 * Email Settings → Connection tab.
 * Technical delivery configuration only — professional sectioned layout.
 */
import { Link } from "wouter";
import { Inbox, Link2, Loader2, Mail, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
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
import { EmailConnectProviderPanel } from "@/components/email/email-connect-provider-panel";
import { useAuthUser } from "@/hooks/use-rbac";
import { canManageEmailConnection } from "@/lib/email-workspace/email-identity-permissions";
import type {
  EmailEncryption,
  EmailSettingsDraft,
  CompanyEmailSettings,
} from "@/lib/notifications/providers/email/types/email-types";
import { isEmailApiConfigured } from "@/lib/notifications/providers/email/services/email-api-client";

type HealthSnapshot = {
  ok?: boolean;
  latencyMs?: number;
  error?: string | null;
} | null | undefined;

type ChannelHealthSnapshot = {
  ok?: boolean;
  latencyMs?: number;
  error?: string | null;
  smtp?: { fromEmail?: string | null; error?: string | null };
  imap?: { configured?: boolean; host?: string | null; mailbox?: string | null };
} | null | undefined;

type Props = {
  companyId: string;
  companyChannelId: string | null;
  draft: EmailSettingsDraft;
  settings: CompanyEmailSettings | null | undefined;
  isLoading: boolean;
  globalWebhookUrl: string;
  channelWebhookUrl: string | null;
  health: HealthSnapshot;
  healthLoading: boolean;
  channelHealth: ChannelHealthSnapshot;
  channelHealthLoading: boolean;
  deliveryLastError?: string | null;
  testRecipient: string;
  saving: boolean;
  testing: boolean;
  channelTesting: boolean;
  polling: boolean;
  processingQueue: boolean;
  onDraftChange: (next: EmailSettingsDraft) => void;
  onDraftPatch: (patch: Partial<EmailSettingsDraft>) => void;
  onSettingsChanged: () => void;
  onSave: () => void;
  onTest: () => void;
  onChannelTest: () => void;
  onPollInbox: () => void;
  onProcessQueue: () => void;
  onTestRecipientChange: (value: string) => void;
  onRefetchHealth: () => void;
  onRefetchChannelHealth: () => void;
};

function SectionHeader({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: string;
  icon: typeof Mail;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {step}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function EmailSettingsConnectionPanel(props: Props) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canEditConnection = canManageEmailConnection(hasPermission, isSuperAdmin);
  const {
    companyId,
    companyChannelId,
    draft,
    settings,
    isLoading,
    globalWebhookUrl,
    channelWebhookUrl,
    health,
    healthLoading,
    channelHealth,
    channelHealthLoading,
    deliveryLastError,
    testRecipient,
    saving,
    testing,
    channelTesting,
    polling,
    processingQueue,
  onDraftChange,
  onDraftPatch,
  onSettingsChanged,
    onSave,
    onTest,
    onChannelTest,
    onPollInbox,
    onProcessQueue,
    onTestRecipientChange,
    onRefetchHealth,
    onRefetchChannelHealth,
  } = props;

  const patch = canEditConnection ? onDraftPatch : () => undefined;

  return (
    <div id="email-connection" className="space-y-6" data-testid="email-settings-connection">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("emailModule.settingsHub.tabs.connection")}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("emailModule.settingsHub.connection.pageDescription")}
        </p>
      </header>

      {!canEditConnection ? (
        <p
          className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
          data-testid="email-connection-readonly-banner"
        >
          {t("emailModule.settingsHub.connection.readOnlyBanner")}
        </p>
      ) : null}

      <DashboardCard className="space-y-4 p-5" data-testid="email-connection-section-provider">
        <SectionHeader
          step="1"
          icon={Link2}
          title={t("emailModule.settingsHub.connection.sections.provider")}
          description={t("emailModule.settingsHub.connection.sections.providerHint")}
        />
        {canEditConnection ? (
          <EmailConnectProviderPanel
            companyId={companyId}
            draft={draft}
            onApplyDraft={onDraftChange}
            onSettingsChanged={onSettingsChanged}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("emailModule.settingsHub.connection.permissionHint")}
          </p>
        )}
      </DashboardCard>

      <fieldset
        disabled={!canEditConnection}
        className="min-w-0 space-y-6 border-0 p-0 disabled:opacity-80"
      >
      <DashboardCard className="space-y-5 p-5" data-testid="email-connection-section-smtp">
        <SectionHeader
          step="2"
          icon={Mail}
          title={t("emailModule.settingsHub.connection.sections.smtp")}
          description={t("emailModule.settingsHub.connection.sections.smtpHint")}
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("notifications.loading")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <Label htmlFor="email-enabled">{t("notifications.email.settings.enabled")}</Label>
              <Switch
                id="email-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => patch({ enabled })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("notifications.email.settings.smtpHost")}</Label>
                <Input
                  value={draft.smtpHost}
                  onChange={(event) => patch({ smtpHost: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.email.settings.smtpPort")}</Label>
                <Input
                  type="number"
                  value={draft.smtpPort}
                  onChange={(event) => patch({ smtpPort: Number(event.target.value) || 587 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.email.settings.username")}</Label>
                <Input
                  value={draft.smtpUsername}
                  onChange={(event) => patch({ smtpUsername: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.email.settings.password")}</Label>
                <Input
                  type="password"
                  value={draft.smtpPassword}
                  placeholder={settings?.hasSmtpPassword ? "********" : ""}
                  onChange={(event) => patch({ smtpPassword: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.email.settings.encryption")}</Label>
                <Select
                  value={draft.smtpEncryption}
                  onValueChange={(value) => patch({ smtpEncryption: value as EmailEncryption })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starttls">
                      {t("notifications.email.settings.encryptionStartTls")}
                    </SelectItem>
                    <SelectItem value="ssl">{t("notifications.email.settings.encryptionSsl")}</SelectItem>
                    <SelectItem value="none">{t("notifications.email.settings.encryptionNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.email.settings.fromEmail")}</Label>
                <Input
                  dir="ltr"
                  value={draft.fromEmail}
                  onChange={(event) => patch({ fromEmail: event.target.value })}
                  data-testid="email-connection-from-email"
                />
              </div>
            </div>
          </>
        )}
      </DashboardCard>

      <DashboardCard className="space-y-5 p-5" data-testid="email-connection-section-inbound">
        <SectionHeader
          step="3"
          icon={MessageSquare}
          title={t("emailModule.settingsHub.connection.sections.inbound")}
          description={t("emailModule.settingsHub.connection.sections.inboundHint")}
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("notifications.loading")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <Label htmlFor="email-conversation-enabled">
                {t("notifications.email.conversation.enabled")}
              </Label>
              <Switch
                id="email-conversation-enabled"
                checked={draft.conversationEnabled}
                onCheckedChange={(conversationEnabled) => patch({ conversationEnabled })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("notifications.email.conversation.inboundProvider")}</Label>
                <Select
                  value={draft.inboundProvider}
                  onValueChange={(value) => patch({ inboundProvider: value as EmailSettingsDraft["inboundProvider"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="imap">{t("notifications.email.conversation.inboundImap")}</SelectItem>
                    <SelectItem value="webhook">
                      {t("notifications.email.conversation.inboundWebhook")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.email.conversation.outboundProvider")}</Label>
                <Input readOnly value={t("notifications.email.conversation.outboundSmtp")} />
              </div>
            </div>

            {draft.inboundProvider === "imap" ? (
              <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/10 p-4 sm:grid-cols-2">
                <p className="sm:col-span-2 text-xs font-medium text-muted-foreground">
                  {t("notifications.email.conversation.imapSection")}
                </p>
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.conversation.imapHost")}</Label>
                  <Input
                    value={draft.imapHost}
                    onChange={(event) => patch({ imapHost: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.conversation.imapPort")}</Label>
                  <Input
                    type="number"
                    value={draft.imapPort}
                    onChange={(event) => patch({ imapPort: Number(event.target.value) || 993 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.conversation.imapUsername")}</Label>
                  <Input
                    value={draft.imapUsername}
                    onChange={(event) => patch({ imapUsername: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.conversation.imapPassword")}</Label>
                  <Input
                    type="password"
                    value={draft.imapPassword}
                    placeholder={settings?.hasImapPassword ? "********" : ""}
                    onChange={(event) => patch({ imapPassword: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.conversation.imapEncryption")}</Label>
                  <Select
                    value={draft.imapEncryption}
                    onValueChange={(value) => patch({ imapEncryption: value as EmailEncryption })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssl">{t("notifications.email.settings.encryptionSsl")}</SelectItem>
                      <SelectItem value="starttls">
                        {t("notifications.email.settings.encryptionStartTls")}
                      </SelectItem>
                      <SelectItem value="none">{t("notifications.email.settings.encryptionNone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.conversation.imapMailbox")}</Label>
                  <Input
                    value={draft.imapMailbox}
                    onChange={(event) => patch({ imapMailbox: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.conversation.imapPollInterval")}</Label>
                  <Input
                    type="number"
                    value={draft.imapPollIntervalSeconds}
                    onChange={(event) => patch({ imapPollIntervalSeconds: Number(event.target.value) || 60 })}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("notifications.email.conversation.maxAttachmentBytes")}</Label>
                <Input
                  type="number"
                  value={draft.maxAttachmentBytes}
                  onChange={(event) => patch({ maxAttachmentBytes: Number(event.target.value) || 26_214_400 })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
              <Label>{t("notifications.email.conversation.webhookUrl")}</Label>
              <div className="space-y-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {t("notifications.email.conversation.webhookUrlGlobal")}
                  </p>
                  <Input readOnly dir="ltr" value={globalWebhookUrl} />
                </div>
                {channelWebhookUrl ? (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {t("notifications.email.conversation.webhookUrlChannel")}
                    </p>
                    <Input readOnly dir="ltr" value={channelWebhookUrl} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("notifications.email.conversation.webhookUrlChannelMissing")}{" "}
                    <Link
                      href="/dashboard/channels"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {t("notifications.email.conversation.openChannels")}
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </DashboardCard>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {t("emailModule.settingsHub.connection.saveHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onSave}
            disabled={!canEditConnection || saving || isLoading}
            data-testid="email-connection-save"
          >
            {saving ? <Loader2 className="me-1.5 size-4 animate-spin" /> : null}
            {t("buttons.save")}
          </Button>
          <Button
            variant="outline"
            onClick={onPollInbox}
            disabled={polling || !companyChannelId || !draft.conversationEnabled}
          >
            {polling ? (
              <Loader2 className="me-1.5 size-4 animate-spin" />
            ) : (
              <Inbox className="me-1.5 size-4" />
            )}
            {t("notifications.email.conversation.pollInbox")}
          </Button>
        </div>
      </div>

      <DashboardCard className="space-y-5 p-5" data-testid="email-connection-section-health">
        <SectionHeader
          step="4"
          icon={ShieldCheck}
          title={t("emailModule.settingsHub.connection.sections.health")}
          description={t("emailModule.settingsHub.connection.sections.healthHint")}
        />

        {!isEmailApiConfigured() ? (
          <p className="text-sm text-muted-foreground">{t("notifications.email.settings.apiMissing")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-border/60 p-4">
              <p className="text-sm font-medium">{t("notifications.email.settings.healthTitle")}</p>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className={`inline-flex size-2.5 rounded-full ${health?.ok ? "bg-emerald-400" : "bg-rose-400"}`}
                />
                <span className="flex-1">
                  {health?.ok
                    ? t("notifications.email.settings.healthOk", { ms: health.latencyMs })
                    : t("notifications.email.settings.healthFailed", {
                        error: health?.error ?? "—",
                      })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefetchHealth}
                  disabled={healthLoading}
                >
                  <RefreshCw className={`size-3.5 ${healthLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label>{t("notifications.email.settings.testRecipient")}</Label>
                  <Input
                    dir="ltr"
                    value={testRecipient}
                    onChange={(event) => onTestRecipientChange(event.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={onTest} disabled={testing}>
                    {testing ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t("notifications.email.settings.testConnection")}
                  </Button>
                </div>
              </div>
              <Button variant="secondary" size="sm" disabled={processingQueue} onClick={onProcessQueue}>
                {t("notifications.email.settings.processQueue")}
              </Button>
              {deliveryLastError ? <p className="text-xs text-rose-400">{deliveryLastError}</p> : null}
            </div>

            <div className="space-y-3 rounded-lg border border-border/60 p-4">
              <p className="text-sm font-medium">{t("notifications.email.conversation.healthTitle")}</p>
              {!companyChannelId ? (
                <p className="text-sm text-muted-foreground">
                  {t("notifications.email.conversation.channelRequired")}{" "}
                  <Link
                    href="/dashboard/channels"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {t("notifications.email.conversation.openChannels")}
                  </Link>
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <span
                      className={`inline-flex size-2.5 rounded-full ${channelHealth?.ok ? "bg-emerald-400" : "bg-rose-400"}`}
                    />
                    <span className="flex-1">
                      {channelHealth?.ok
                        ? t("notifications.email.conversation.healthOk", {
                            ms: channelHealth.latencyMs,
                          })
                        : t("notifications.email.conversation.healthFailed", {
                            error:
                              channelHealth?.error ?? channelHealth?.smtp?.error ?? "—",
                          })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onRefetchChannelHealth}
                      disabled={channelHealthLoading}
                    >
                      <RefreshCw
                        className={`size-3.5 ${channelHealthLoading ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                  {channelHealth?.smtp?.fromEmail ? (
                    <p className="text-xs text-muted-foreground">
                      {t("notifications.email.conversation.smtpVerified", {
                        email: channelHealth.smtp.fromEmail,
                      })}
                    </p>
                  ) : null}
                  {channelHealth?.imap?.configured ? (
                    <p className="text-xs text-muted-foreground">
                      {t("notifications.email.conversation.imapConfigured", {
                        host: channelHealth.imap.host,
                        mailbox: channelHealth.imap.mailbox ?? "INBOX",
                      })}
                    </p>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={onChannelTest}
                    disabled={channelTesting || !companyChannelId}
                  >
                    {channelTesting ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t("notifications.email.conversation.connectionTest")}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DashboardCard>
      </fieldset>
    </div>
  );
}
