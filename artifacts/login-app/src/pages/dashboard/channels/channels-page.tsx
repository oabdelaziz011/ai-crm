import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Plus, Radio, Settings2, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";
import { ChannelInboundRoutingStrip } from "@/components/channels/channel-inbound-routing-strip";
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
import {
  useChannelWorkflowBindingForm,
  useCompanyChannelWorkflowBindings,
  useDisableChannelWorkflowBinding,
  useEnableChannelWorkflowBinding,
} from "@/hooks/channels/use-channel-workflow-binding";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { resolveChannelCommercialFeatureCode } from "@/lib/billing/feature-code-map";
import { useToast } from "@/hooks/use-toast";
import { cancelActiveAutomationSessionsForFlow, formatChannelWorkflowBindingError } from "@/lib/channel-workflow-binding/channel-workflow-binding-repository";
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
import { supabase } from "@/lib/supabase";
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
import { cn } from "@/lib/utils";

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
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();
  const { data: channels = [], isLoading, error } = useCompanyChannelsAdmin();
  const { data: channelTypes = [] } = useCommunicationChannelTypes();
  const { create, updateConfig, enable, disable, setDefault } = useChannelAdminMutations(companyId);
  const {
    data: workflowBindings = [],
    isLoading: workflowBindingsLoading,
  } = useCompanyChannelWorkflowBindings(companyId);
  const disableWorkflow = useDisableChannelWorkflowBinding(companyId);
  const enableWorkflow = useEnableChannelWorkflowBinding(companyId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<CompanyChannelRecord | null>(null);
  const [channelTypeId, setChannelTypeId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [routingActionChannelId, setRoutingActionChannelId] = useState<string | null>(null);

  const workflowBinding = useChannelWorkflowBindingForm(
    companyId,
    configTarget?.id ?? null,
    configDialogOpen,
  );

  const bindingByChannelId = useMemo(() => {
    const map = new Map(workflowBindings.map((item) => [item.companyChannelId, item]));
    return map;
  }, [workflowBindings]);

  const isChannelEntitled = (channelKey: string | undefined): boolean => {
    const featureCode = resolveChannelCommercialFeatureCode(channelKey);
    if (!featureCode) return true;
    return commercialFeatureEnabled(featureCode) === true;
  };

  // If workflow binding is already off, cancel leftover waiting sessions so old
  // interactive WhatsApp steps cannot keep looking like "automation is still answering".
  useEffect(() => {
    if (!companyId || workflowBindingsLoading) return;
    const disabledFlowIds = [
      ...new Set(
        workflowBindings
          .filter((item) => !item.isEnabled && item.automationFlowId)
          .map((item) => item.automationFlowId),
      ),
    ];
    if (disabledFlowIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const automationFlowId of disabledFlowIds) {
        if (cancelled) return;
        try {
          await cancelActiveAutomationSessionsForFlow(supabase, {
            companyId,
            automationFlowId,
          });
        } catch {
          /* best-effort cleanup */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, workflowBindings, workflowBindingsLoading]);

  const selectedType = channelTypes.find((type) => type.id === channelTypeId);
  const selectedTypeEntitled = isChannelEntitled(selectedType?.key);
  const isWhatsAppType = selectedType?.key === "whatsapp";
  const isWebChatType = selectedType?.key === "web_chat";
  const showProviderField = Boolean(selectedType) && !isFixedProviderChannel(selectedType?.key);
  const isWhatsAppChannel = (channel: CompanyChannelRecord) =>
    channel.communication_channel?.key === "whatsapp";
  const supportsInboundRouting = (channel: CompanyChannelRecord) => {
    const key = channel.communication_channel?.key;
    return key === "whatsapp" || key === "messenger" || key === "instagram" || key === "web_chat";
  };
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
    if (!isChannelEntitled(channel.communication_channel?.key)) return;
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
    if (!isChannelEntitled(selectedType.key)) {
      toast({
        title: t("dashboard.channels.featureNotEntitled"),
        variant: "destructive",
      });
      return;
    }
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
      channelTypeKey: selectedType.key,
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
      if (isWhatsAppChannel(configTarget)) {
        await updateConfig.mutateAsync({
          companyChannelId: configTarget.id,
          configuration: buildWhatsAppReferenceConfiguration(),
          webhookUrl: productionWebhookUrl,
          channelTypeKey: configTarget.communication_channel?.key,
        });
      }

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
        description: formatChannelWorkflowBindingError(saveError),
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

  const handleDisableWorkflow = async (companyChannelId: string) => {
    const channel = channels.find((item) => item.id === companyChannelId);
    if (!isChannelEntitled(channel?.communication_channel?.key)) return;
    const binding = bindingByChannelId.get(companyChannelId);
    if (!binding?.isEnabled) return;
    setRoutingActionChannelId(companyChannelId);
    try {
      await disableWorkflow.mutateAsync(binding);
      toast({
        title: t("dashboard.channels.automationWorkflow.bindingDisabled"),
        description: t("dashboard.channels.inboundRouting.disableSuccessHint"),
      });
    } catch (disableError) {
      toast({
        title: t("dashboard.channels.automationWorkflow.saveError"),
        description: formatChannelWorkflowBindingError(disableError),
        variant: "destructive",
      });
    } finally {
      setRoutingActionChannelId(null);
    }
  };

  const handleEnableWorkflow = async (companyChannelId: string) => {
    const channel = channels.find((item) => item.id === companyChannelId);
    if (!isChannelEntitled(channel?.communication_channel?.key)) return;
    const binding = bindingByChannelId.get(companyChannelId);
    if (!binding || binding.isEnabled || !binding.automationFlowId) return;
    setRoutingActionChannelId(companyChannelId);
    try {
      await enableWorkflow.mutateAsync(binding);
      toast({
        title: t("dashboard.channels.automationWorkflow.bindingUpdated"),
        description: t("dashboard.channels.inboundRouting.enableSuccessHint"),
      });
    } catch (enableError) {
      toast({
        title: t("dashboard.channels.automationWorkflow.saveError"),
        description: formatChannelWorkflowBindingError(enableError),
        variant: "destructive",
      });
    } finally {
      setRoutingActionChannelId(null);
    }
  };

  const isSaveConfigDisabled =
    updateConfig.isPending
    || workflowBinding.saveBinding.isPending
    || workflowBinding.bindingLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.channels.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.channels.subtitle")}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("dashboard.channels.inboundRouting.pageHint")}
          </p>
        </div>
        <Can permission="channels.manage">
          <Button onClick={openCreateDialog} className="gap-2 shrink-0">
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
          <div className="divide-y divide-border/60">
            {channels.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("dashboard.channels.empty")}</p>
            )}
            {channels.map((channel) => {
              const showInboundRouting = supportsInboundRouting(channel);
              const binding = bindingByChannelId.get(channel.id) ?? null;
              const channelKey = channel.communication_channel?.key;
              const entitled = isChannelEntitled(channelKey);

              return (
                <div key={channel.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold tracking-tight">{channel.display_name}</p>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            channel.is_enabled
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {channel.is_enabled
                            ? t("dashboard.channels.enabledStatus.enabled")
                            : t("dashboard.channels.enabledStatus.disabled")}
                        </span>
                        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {healthStatusLabel(t, channel.health_status)}
                        </span>
                        {channel.is_default ? (
                          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                            {t("dashboard.channels.default")}
                          </span>
                        ) : null}
                        {!entitled ? (
                          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-700 dark:text-rose-300">
                            {t("dashboard.channels.featureNotEntitledBadge")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {channelTypeLabel(
                          t,
                          channel.communication_channel?.key,
                          channel.communication_channel?.display_name,
                        )}{" "}
                        · {providerLabel(t, channel.provider)}
                        <span className="mx-1.5 text-border">·</span>
                        {format(new Date(channel.updated_at), "PP")}
                      </p>
                      {!entitled ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("dashboard.channels.featureNotEntitled")}
                        </p>
                      ) : null}
                    </div>

                    <Can permission="channels.manage">
                      <div className="flex flex-wrap items-center gap-2">
                        {channel.is_enabled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={!entitled || disable.isPending}
                            onClick={() =>
                              disable.mutate({
                                companyChannelId: channel.id,
                                channelTypeKey: channel.communication_channel?.key,
                              })
                            }
                            title={t("dashboard.channels.disableChannel")}
                          >
                            <WifiOff className="size-3.5" />
                            {t("dashboard.channels.disableChannel")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={!entitled || enable.isPending}
                            onClick={() =>
                              enable.mutate({
                                companyChannelId: channel.id,
                                channelTypeKey: channel.communication_channel?.key,
                              })
                            }
                            title={t("dashboard.channels.enableChannel")}
                          >
                            <Wifi className="size-3.5" />
                            {t("dashboard.channels.enableChannel")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={channel.is_default ? "secondary" : "ghost"}
                          disabled={
                            !entitled
                            || channel.is_default
                            || !channel.is_enabled
                            || setDefault.isPending
                          }
                          onClick={() => {
                            if (!channel.is_default && channel.is_enabled && entitled) {
                              setDefault.mutate({
                                companyChannelId: channel.id,
                                channelTypeKey: channel.communication_channel?.key,
                              });
                            }
                          }}
                          title={
                            channel.is_default
                              ? t("dashboard.channels.default")
                              : t("dashboard.channels.makeDefault")
                          }
                        >
                          {channel.is_default
                            ? t("dashboard.channels.default")
                            : t("dashboard.channels.makeDefault")}
                        </Button>
                      </div>
                    </Can>
                  </div>

                  {showInboundRouting ? (
                    <ChannelInboundRoutingStrip
                      binding={binding}
                      loading={workflowBindingsLoading}
                      actionsDisabled={
                        !entitled
                        || (
                          channelKey === "email"
                          && commercialFeatureEnabled("ai_email_routing") !== true
                          && !binding?.isEnabled
                        )
                      }
                      disabling={
                        routingActionChannelId === channel.id && disableWorkflow.isPending
                      }
                      enabling={
                        routingActionChannelId === channel.id && enableWorkflow.isPending
                      }
                      onDisableWorkflow={() => void handleDisableWorkflow(channel.id)}
                      onEnableWorkflow={() => void handleEnableWorkflow(channel.id)}
                      onConfigure={() => openConfigDialog(channel)}
                    />
                  ) : null}
                </div>
              );
            })}
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
                  {channelTypes.map((type) => {
                    const typeEntitled = isChannelEntitled(type.key);
                    return (
                      <SelectItem key={type.id} value={type.id} disabled={!typeEntitled}>
                        {type.display_name}
                        {!typeEntitled
                          ? ` — ${t("dashboard.channels.featureNotEntitledBadge")}`
                          : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedType && !selectedTypeEntitled ? (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.channels.featureNotEntitled")}
                </p>
              ) : null}
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
            <Button
              onClick={() => void handleCreate()}
              disabled={
                create.isPending
                || !channelTypeId
                || !displayName.trim()
                || !selectedTypeEntitled
              }
            >
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
            {configTarget && isWhatsAppChannel(configTarget) ? (
              <>
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
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.channels.inboundRouting.pageHint")}
              </p>
            )}
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
