import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import {
  useEmailChannelConnectionTest,
  useEmailChannelOutboundHealth,
  useEmailCompanyChannel,
  useEmailConnectionTest,
  useEmailDeliverySummary,
  useEmailHealth,
  useEmailPollInbox,
  useEmailSettings,
  useProcessEmailQueue,
  useUpdateEmailSettings,
} from "@/hooks/notifications/use-email-health";
import type { EmailSettingsDraft } from "@/lib/notifications/providers/email/types/email-types";
import {
  buildEmailChannelWebhookUrl,
  buildEmailWebhookUrl,
  resolveChannelWebhookBaseUrl,
} from "@/lib/channels/whatsapp-channel-utils";
import { EmailSettingsControlHub } from "@/components/email/email-settings-control-hub";
import { EmailSettingsIdentityPanel } from "@/components/email/email-settings-identity-panel";
import { EmailSettingsConnectionPanel } from "@/components/email/email-settings-connection-panel";
import { companyEmailSettingsToDraft } from "@/lib/notifications/providers/email/services/email-settings-repository";
import { resolveEmailSettingsTab } from "@/lib/email-workspace/email-settings-tabs";
import {
  canAccessEmailIdentityTab,
  canManageEmailConnection,
} from "@/lib/email-workspace/email-identity-permissions";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY_SETTINGS: EmailSettingsDraft = {
  enabled: false,
  conversationEnabled: false,
  inboundProvider: "imap",
  outboundProvider: "smtp",
  mailboxProvider: "imap_smtp",
  connectionStatus: "disabled",
  connectionLastError: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUsername: "",
  smtpPassword: "",
  smtpEncryption: "starttls",
  imapHost: "",
  imapPort: 993,
  imapUsername: "",
  imapPassword: "",
  imapEncryption: "ssl",
  fromEmail: "",
  fromName: "",
  replyToEmail: "",
  maxRetryCount: 3,
  maxAttachmentBytes: 26_214_400,
  imapMailbox: "INBOX",
  imapPollIntervalSeconds: 60,
  oauthProvider: null,
  oauthToken: "",
};

export function SettingsEmailPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canConnection = canManageEmailConnection(hasPermission, isSuperAdmin);
  const canIdentity = canAccessEmailIdentityTab(hasPermission, isSuperAdmin);
  const search = useSearch();
  const companyId = profile?.company_id ?? null;
  const requestedTab = resolveEmailSettingsTab({
    search,
    hash: typeof window !== "undefined" ? window.location.hash : "",
  });
  const activeTab =
    requestedTab === "connection" && !canConnection && canIdentity
      ? "identity"
      : requestedTab === "identity" && !canIdentity && canConnection
        ? "connection"
        : requestedTab;

  const { data: settings, isLoading } = useEmailSettings(companyId);
  const emailChannel = useEmailCompanyChannel(companyId);
  const companyChannelId = emailChannel?.id ?? null;

  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = useEmailHealth(companyId);
  const {
    data: channelHealth,
    isFetching: channelHealthLoading,
    refetch: refetchChannelHealth,
  } = useEmailChannelOutboundHealth(companyId, companyChannelId);
  const { data: deliverySummary } = useEmailDeliverySummary(companyId);
  const updateSettings = useUpdateEmailSettings(companyId);
  const queryClient = useQueryClient();
  const testConnection = useEmailConnectionTest(companyId);
  const channelConnectionTest = useEmailChannelConnectionTest(companyId, companyChannelId);
  const pollInbox = useEmailPollInbox(companyId, companyChannelId);
  const processQueue = useProcessEmailQueue(companyId);

  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [testRecipient, setTestRecipient] = useState("");

  const webhookBaseUrl = resolveChannelWebhookBaseUrl();
  const globalWebhookUrl = useMemo(() => buildEmailWebhookUrl(webhookBaseUrl), [webhookBaseUrl]);
  const channelWebhookUrl = useMemo(
    () => (companyChannelId ? buildEmailChannelWebhookUrl(webhookBaseUrl, companyChannelId) : null),
    [webhookBaseUrl, companyChannelId],
  );

  useEffect(() => {
    if (settings) {
      setDraft(companyEmailSettingsToDraft(settings));
    }
  }, [settings]);

  const onSave = () => {
    updateSettings.mutate(draft, {
      onSuccess: () => toast({ title: t("notifications.email.settings.saved") }),
      onError: (error) =>
        toast({
          title: t("notifications.email.settings.saveFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const onTest = () => {
    if (!testRecipient.trim()) return;
    testConnection.mutate(testRecipient.trim(), {
      onSuccess: () => toast({ title: t("notifications.email.settings.testSuccess") }),
      onError: (error) =>
        toast({
          title: t("notifications.email.settings.testFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const onChannelConnectionTest = () => {
    if (!companyChannelId) return;
    channelConnectionTest.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok) {
          toast({ title: t("notifications.email.conversation.connectionTestSuccess") });
        } else {
          toast({
            title: t("notifications.email.conversation.connectionTestFailed"),
            description: result.error ?? t("notifications.email.conversation.healthFailed", { error: "—" }),
            variant: "destructive",
          });
        }
        void refetchChannelHealth();
      },
      onError: (error) =>
        toast({
          title: t("notifications.email.conversation.connectionTestFailed"),
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  const onPollInbox = () => {
    if (!companyChannelId) return;
    pollInbox.mutate(undefined, {
      onSuccess: () => toast({ title: t("notifications.email.conversation.pollSuccess") }),
      onError: (error) =>
        toast({
          title: t("notifications.email.conversation.pollFailed"),
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
      <EmailSettingsControlHub activeTab={activeTab} />

      {activeTab === "identity" && canIdentity ? (
        <EmailSettingsIdentityPanel companyId={companyId} />
      ) : null}

      {activeTab === "connection" && canConnection ? (
        <EmailSettingsConnectionPanel
          companyId={companyId}
          companyChannelId={companyChannelId}
          draft={draft}
          settings={settings}
          isLoading={isLoading}
          globalWebhookUrl={globalWebhookUrl}
          channelWebhookUrl={channelWebhookUrl}
          health={health}
          healthLoading={healthLoading}
          channelHealth={channelHealth}
          channelHealthLoading={channelHealthLoading}
          deliveryLastError={deliverySummary?.lastError ?? null}
          testRecipient={testRecipient}
          saving={updateSettings.isPending}
          testing={testConnection.isPending}
          channelTesting={channelConnectionTest.isPending}
          polling={pollInbox.isPending}
          processingQueue={processQueue.isPending}
          onDraftChange={setDraft}
          onDraftPatch={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
          onSettingsChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["email-settings", companyId] });
          }}
          onSave={onSave}
          onTest={onTest}
          onChannelTest={onChannelConnectionTest}
          onPollInbox={onPollInbox}
          onProcessQueue={() =>
            processQueue.mutate(undefined, {
              onSuccess: (result) =>
                toast({
                  title: t("notifications.email.settings.queueProcessed", {
                    completed: (result as { completed?: number }).completed ?? 0,
                  }),
                }),
            })
          }
          onTestRecipientChange={setTestRecipient}
          onRefetchHealth={() => void refetchHealth()}
          onRefetchChannelHealth={() => void refetchChannelHealth()}
        />
      ) : null}
    </div>
  );
}
