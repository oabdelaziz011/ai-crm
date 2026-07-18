import { useState } from "react";
import { format } from "date-fns";
import { Plus, Radio, Settings2, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";
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

export default function ChannelsPage() {
  const { t } = useTranslation("common");
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
  const [provider, setProvider] = useState("meta");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [apiVersion, setApiVersion] = useState("v21.0");

  const selectedType = channelTypes.find((type) => type.id === channelTypeId);
  const isWhatsAppType = selectedType?.key === "whatsapp";
  const isWhatsAppChannel = (channel: CompanyChannelRecord) =>
    channel.communication_channel?.key === "whatsapp";

  const openConfigDialog = (channel: CompanyChannelRecord) => {
    setConfigTarget(channel);
    setPhoneNumberId(readConfigString(channel.configuration, "phoneNumberId"));
    setAccessToken(readConfigString(channel.configuration, "accessToken"));
    setVerifyToken(readConfigString(channel.configuration, "verifyToken"));
    setApiVersion(readConfigString(channel.configuration, "apiVersion") || "v21.0");
    setConfigDialogOpen(true);
  };

  const buildWhatsAppConfiguration = () => ({
    phoneNumberId: phoneNumberId.trim(),
    accessToken: accessToken.trim(),
    verifyToken: verifyToken.trim(),
    ...(apiVersion.trim() ? { apiVersion: apiVersion.trim() } : {}),
  });

  const enabledCount = channels.filter((c) => c.is_enabled).length;
  const connectedCount = channels.filter((c) => c.health_status === "connected").length;

  const handleCreate = async () => {
    if (!channelTypeId || !displayName.trim()) return;
    const configuration =
      isWhatsAppType && phoneNumberId.trim() && accessToken.trim() && verifyToken.trim()
        ? buildWhatsAppConfiguration()
        : {};
    await create.mutateAsync({
      channelId: channelTypeId,
      displayName: displayName.trim(),
      provider,
      isEnabled: true,
      status: "active",
      healthStatus: "unknown",
      configuration,
    });
    setDialogOpen(false);
    setDisplayName("");
    setChannelTypeId("");
    setPhoneNumberId("");
    setAccessToken("");
    setVerifyToken("");
    setApiVersion("v21.0");
  };

  const handleSaveConfig = async () => {
    if (!configTarget) return;
    await updateConfig.mutateAsync({
      companyChannelId: configTarget.id,
      configuration: buildWhatsAppConfiguration(),
    });
    setConfigDialogOpen(false);
    setConfigTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.channels.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.channels.subtitle")}</p>
        </div>
        <Can permission="channels.manage">
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
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
                    {channel.communication_channel?.display_name ?? channel.provider} ·{" "}
                    {channel.communication_channel?.key ?? "—"}
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
                    {channel.is_enabled ? t("status.active") : t("status.inactive")}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">{channel.health_status}</span>
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
              <Select value={channelTypeId} onValueChange={setChannelTypeId}>
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
            <div className="space-y-2">
              <Label>{t("dashboard.channels.provider")}</Label>
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
            {isWhatsAppType && (
              <div className="space-y-3 rounded-lg border border-white/10 p-3">
                <p className="text-xs font-medium">{t("dashboard.channels.whatsappConfig")}</p>
                <div className="space-y-2">
                  <Label>{t("dashboard.channels.phoneNumberId")}</Label>
                  <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("dashboard.channels.accessToken")}</Label>
                  <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("dashboard.channels.verifyToken")}</Label>
                  <Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("dashboard.channels.apiVersion")}</Label>
                  <Input value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} />
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
            <div className="space-y-2">
              <Label>{t("dashboard.channels.phoneNumberId")}</Label>
              <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.channels.accessToken")}</Label>
              <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.channels.verifyToken")}</Label>
              <Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.channels.apiVersion")}</Label>
              <Input value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => void handleSaveConfig()}
              disabled={
                updateConfig.isPending
                || !phoneNumberId.trim()
                || !accessToken.trim()
                || !verifyToken.trim()
              }
            >
              {t("dashboard.channels.saveConfig")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
