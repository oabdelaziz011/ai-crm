import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Plus, Radio, Settings2, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";
import { ChannelWorkflowBindingSection } from "@/components/channels/channel-workflow-binding-section";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardStatCard,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import {
  useChannelAdminMutations,
  useCommunicationChannelTypes,
  useCompanyChannelsAdmin,
} from "@/hooks/channels/use-company-channels-admin";
import { useChannelWorkflowBindingForm } from "@/hooks/channels/use-channel-workflow-binding";
import { useToast } from "@/hooks/use-toast";
import type { SaveChannelWorkflowBindingResult } from "@/lib/channel-workflow-binding/types";
import {
  buildWhatsAppWebhookUrl,
  resolveWhatsAppWebhookBaseUrl,
} from "@/lib/channels/whatsapp-channel-utils";
import {
  isFixedProviderChannel,
  resolveDefaultChannelProvider,
  resolveDefaultHealthStatus,
} from "@/lib/channels/channel-defaults";
import type { CompanyChannelRecord } from "@workspace/channel-registry";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function readConfigString(configuration: Record<string, unknown>, key: string): string {
  const value = configuration[key];
  return typeof value === "string" ? value : "";
}

function channelTypeLabel(
  translate: (key: string, options?: { defaultValue?: string }) => string,
  channelKey: string | undefined,
  fallbackName?: string,
): string {
  if (!channelKey) return fallbackName ?? "—";
  return translate(`dashboard.channels.channelTypes.${channelKey}`, {
    defaultValue: fallbackName ?? channelKey,
  });
}

function healthStatusLabel(
  translate: (key: string, options?: { defaultValue?: string }) => string,
  healthStatus: string,
): string {
  return translate(`dashboard.channels.healthStatus.${healthStatus}`, {
    defaultValue: healthStatus,
  });
}

function providerLabel(
  translate: (key: string, options?: { defaultValue?: string }) => string,
  provider: string,
): string {
  if (!provider.trim()) {
    return translate("dashboard.channels.providers.internal");
  }
  return translate(`dashboard.channels.providers.${provider}`, {
    defaultValue: provider,
  });
}

export default function ChannelsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: channels = [], isLoading, error } = useCompanyChannelsAdmin();
  const { data: channelTypes = [] } = useCommunicationChannelTypes();
  const { create, updateConfig, enable, disable, setDefault } = useChannelAdminMutations(companyId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<CompanyChannelRecord | null>(null);
  const [channelTypeId, setChannelTypeId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");

  const workflowBinding = useChannelWorkflowBindingForm(
    companyId,
    configTarget?.id ?? null,
    configDialogOpen,
  );

  const selectedType = channelTypes.find((type) => type.id === channelTypeId);
  const isWhatsAppType = selectedType?.key === "whatsapp";
  const isWebChatType = selectedType?.key === "web_chat";
  const showProviderField = Boolean(selectedType) && !isFixedProviderChannel(selectedType?.key);
  const isWhatsAppChannel = (channel: CompanyChannelRecord) =>
    channel.communication_channel?.key === "whatsapp";
  const webhookBaseUrl = resolveWhatsAppWebhookBaseUrl();
  const productionWebhookUrl = buildWhatsAppWebhookUrl(webhookBaseUrl);

  const handleChannelTypeChange = (nextChannelTypeId: string) => {
    setChannelTypeId(nextChannelTypeId);
    const nextType = channelTypes.find((type) => type.id === nextChannelTypeId);
    setProvider(resolveDefaultChannelProvider(nextType?.key));
  };

  const openCreateDialog = () => {
    setChannelTypeId("");
    setDisplayName("");
    setProvider("");
    setPhoneNumberId("");
    setDialogOpen(true);
  };

  const openConfigDialog = (channel: CompanyChannelRecord) => {
    setConfigTarget(channel);
    setPhoneNumberId(readConfigString(channel.configuration, "phoneNumberId"));
    setConfigDialogOpen(true);
  };

  const buildWhatsAppReferenceConfiguration = () => ({
    credentialsSource: "company_whatsapp_settings",
    ...(phoneNumberId.trim() ? { phoneNumberId: phoneNumberId.trim() } : {}),
  });

  const enabledCount = channels.filter((c) => c.is_enabled).length;
  const connectedCount = channels.filter((c) => c.health_status === "connected").length;

  const handleCreate = async () => {
    if (!channelTypeId || !displayName.trim() || !selectedType) return;
    const configuration = isWhatsAppType
      ? buildWhatsAppReferenceConfiguration()
      : ({} as Record<string, unknown>);

    const resolvedProvider = isFixedProviderChannel(selectedType.key)
      ? resolveDefaultChannelProvider(selectedType.key)
      : provider.trim() || resolveDefaultChannelProvider(selectedType.key);
    const hasExistingWebChat = channels.some(
      (channel) => channel.communication_channel?.key === "web_chat",
    );
    const hasDefaultChannel = channels.some((channel) => channel.is_default);

    await create.mutateAsync({
      channelId: channelTypeId,
      displayName: displayName.trim(),
      provider: resolvedProvider,
      isEnabled: true,
      status: "active",
      healthStatus: resolveDefaultHealthStatus(selectedType.key),
      isDefault: isWebChatType && !hasExistingWebChat && !hasDefaultChannel,
      configuration,
      webhookUrl: isWhatsAppType ? productionWebhookUrl : undefined,
    });
    setDialogOpen(false);
    setDisplayName("");
    setChannelTypeId("");
    setProvider("");
    setPhoneNumberId("");
  };

  const handleSaveConfig = async () => {
    if (!configTarget) return;

    if (workflowBinding.workflowEnabled && !workflowBinding.selectedFlowId) {
      toast({
        title: t("dashboard.channels.automationWorkflow.saveError"),
        description: t("dashboard.channels.automationWorkflow.missingWorkflow"),
        variant: "destructive",
      });
      return;
    }

    try {
      await updateConfig.mutateAsync({
        companyChannelId: configTarget.id,
        configuration: buildWhatsAppReferenceConfiguration(),
        webhookUrl: productionWebhookUrl,
      });

      const bindingResult = await workflowBinding.saveBinding.mutateAsync(workflowBinding.binding);
      toast({
        title: t("dashboard.channels.automationWorkflow.saveSuccess"),
        description: bindingToastMessage(t, bindingResult),
      });
      setConfigDialogOpen(false);
      setConfigTarget(null);
    } catch (saveError) {
      toast({
        title: t("dashboard.channels.automationWorkflow.saveError"),
        description: saveError instanceof Error ? saveError.message : String(saveError),
        variant: "destructive",
      });
    }
  };

  function bindingToastMessage(
    translate: (key: string) => string,
    result: SaveChannelWorkflowBindingResult,
  ): string {
    switch (result.action) {
      case "created":
        return translate("dashboard.channels.automationWorkflow.bindingCreated");
      case "updated":
        return translate("dashboard.channels.automationWorkflow.bindingUpdated");
      case "disabled":
        return translate("dashboard.channels.automationWorkflow.bindingDisabled");
      case "removed":
        return translate("dashboard.channels.automationWorkflow.bindingRemoved");
      default:
        return translate("dashboard.channels.automationWorkflow.saveSuccess");
    }
  }

  const handleSaveConfigClick = () => {
    void handleSaveConfig();
  };

  const isSaveConfigDisabled =
    updateConfig.isPending
    || workflowBinding.saveBinding.isPending
    || workflowBinding.bindingLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.channels.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.channels.subtitle")}</p>
        </div>
        <Can permission="channels.manage">
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("dashboard.channels.addChannel")}
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard label={t("dashboard.channels.stats.total")} value={channels.length} icon={Radio} loading={isLoading} />
        <DashboardStatCard label={t("dashboard.channels.stats.enabled")} value={enabledCount} icon={Wifi} loading={isLoading} />
        <DashboardStatCard label={t("dashboard.channels.stats.connected")} value={connectedCount} icon={Wifi} loading={isLoading} />
        <DashboardStatCard
          label={t("dashboard.channels.stats.types")}
          value={new Set(channels.map((c) => c.communication_channel?.key)).size}
          icon={Settings2}
          loading={isLoading}
        />
      </div>

      {error && <DashboardErrorBanner message={error.message} />}

      <DashboardCard className="overflow-hidden">
        {isLoading ? (
          <DashboardTableSkeleton rows={4} />
        ) : (
          <div className="divide-y divide-white/5">
            {channels.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("dashboard.channels.empty")}</p>
            )}
            {channels.map((channel) => (
              <div key={channel.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{channel.display_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {channelTypeLabel(
                      t,
                      channel.communication_channel?.key,
                      channel.communication_channel?.display_name,
                    )}{" "}
                    · {providerLabel(t, channel.provider)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">{channel.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${
                      channel.is_enabled
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-white/10 text-muted-foreground"
                    }`}
                  >
                    {channel.is_enabled
                      ? t("dashboard.channels.enabledStatus.enabled")
                      : t("dashboard.channels.enabledStatus.disabled")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {healthStatusLabel(t, channel.health_status)}
                  </span>
                  {channel.is_default && (
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {t("dashboard.channels.default")}
                    </span>
                  )}
                  <Can permission="channels.manage">
                    <div className="flex gap-2">
                      {isWhatsAppChannel(channel) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/10"
                          onClick={() => openConfigDialog(channel)}
                        >
                          {t("dashboard.channels.configure")}
                        </Button>
                      )}
                      {channel.is_enabled ? (
                        <Button size="sm" variant="outline" className="border-white/10" onClick={() => disable.mutate(channel.id)}>
                          <WifiOff className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="border-white/10" onClick={() => enable.mutate(channel.id)}>
                          <Wifi className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {!channel.is_default && channel.is_enabled && (
                        <Button size="sm" variant="outline" className="border-white/10" onClick={() => setDefault.mutate(channel.id)}>
                          {t("dashboard.channels.makeDefault")}
                        </Button>
                      )}
                    </div>
                  </Can>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(channel.updated_at), "PP")}
                </span>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.channels.addChannel")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("dashboard.channels.channelType")}</Label>
              <Select value={channelTypeId} onValueChange={handleChannelTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("dashboard.channels.selectType")} />
                </SelectTrigger>
                <SelectContent>
                  {channelTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.channels.displayName")}</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            {showProviderField && (
              <div className="space-y-2">
                <Label>{t("dashboard.channels.provider")}</Label>
                <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
              </div>
            )}
            {isWebChatType && (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.channels.webChatProviderHint", {
                  provider: providerLabel(t, resolveDefaultChannelProvider("web_chat")),
                })}
              </p>
            )}
            {isWhatsAppType && (
              <div className="space-y-3 rounded-lg border border-white/10 p-3">
                <p className="text-xs font-medium">{t("dashboard.channels.whatsappConfig")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.channels.whatsappCredentialsManagedInSettings")}{" "}
                  <Link to="/dashboard/settings/whatsapp" className="text-primary underline underline-offset-2">
                    {t("dashboard.settings.nav.whatsapp")}
                  </Link>
                </p>
                <div className="space-y-2">
                  <Label>{t("dashboard.channels.webhookUrl")}</Label>
                  <Input value={productionWebhookUrl} readOnly className="font-mono text-xs" />
                  <p className="text-[11px] text-muted-foreground">
                    {webhookBaseUrl
                      ? t("dashboard.channels.webhookUrlHelp")
                      : t("dashboard.channels.webhookUrlMissingBase")}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreate()} disabled={create.isPending || !channelTypeId || !displayName.trim()}>
              {t("buttons.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.channels.configure")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">{t("dashboard.channels.whatsappConfig")}</p>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.channels.whatsappCredentialsManagedInSettings")}{" "}
              <Link to="/dashboard/settings/whatsapp" className="text-primary underline underline-offset-2">
                {t("dashboard.settings.nav.whatsapp")}
              </Link>
            </p>
            <div className="space-y-2">
              <Label>{t("dashboard.channels.phoneNumberId")}</Label>
              <Input
                value={phoneNumberId}
                readOnly
                placeholder={t("dashboard.channels.phoneNumberIdSyncedHint")}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.channels.webhookUrl")}</Label>
              <Input value={productionWebhookUrl} readOnly className="font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">
                {webhookBaseUrl
                  ? t("dashboard.channels.webhookUrlHelp")
                  : t("dashboard.channels.webhookUrlMissingBase")}
              </p>
            </div>
            <ChannelWorkflowBindingSection
              workflowEnabled={workflowBinding.workflowEnabled}
              onWorkflowEnabledChange={workflowBinding.setWorkflowEnabled}
              selectedFlowId={workflowBinding.selectedFlowId}
              onSelectedFlowIdChange={workflowBinding.setSelectedFlowId}
              flows={workflowBinding.flows}
              loading={workflowBinding.flowsLoading || workflowBinding.bindingLoading}
              disabled={updateConfig.isPending || workflowBinding.saveBinding.isPending}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleSaveConfigClick} disabled={isSaveConfigDisabled}>
              {t("dashboard.channels.saveConfig")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
