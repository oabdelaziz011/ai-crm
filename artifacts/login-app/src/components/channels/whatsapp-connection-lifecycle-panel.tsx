import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Unplug, ArrowRightLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardCard } from "@/components/dashboard/ui";
import { useToast } from "@/hooks/use-toast";
import { useCompanies } from "@/hooks/use-companies";
import { useAuth } from "@/context/auth-context";
import {
  disconnectWhatsAppConnection,
  fetchWhatsAppLifecycleEvents,
  isWhatsAppLifecycleApiConfigured,
  transferWhatsAppConnection,
  type WhatsAppLifecycleEvent,
} from "@/lib/channels/whatsapp-connection-lifecycle-client";

export type WhatsAppConnectionLifecyclePanelProps = {
  companyId: string;
  companyName?: string | null;
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  enabled?: boolean;
  hasAccessToken?: boolean;
  onChanged?: () => void;
};

export function WhatsAppConnectionLifecyclePanel({
  companyId,
  companyName,
  phoneNumberId,
  businessAccountId,
  enabled = false,
  hasAccessToken = false,
  onChanged,
}: WhatsAppConnectionLifecyclePanelProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const isSuperAdmin = Boolean(profile?.is_super_admin);
  const companiesQuery = useCompanies(isSuperAdmin);

  const [busy, setBusy] = useState<"disconnect" | "transfer" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState("");
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [events, setEvents] = useState<WhatsAppLifecycleEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const bound = Boolean((phoneNumberId ?? "").trim() || hasAccessToken);
  const phone = (phoneNumberId ?? "").trim();
  const disconnectConfirmed = ["disconnect", "فصل"].includes(confirmDisconnect.trim().toLowerCase())
    || confirmDisconnect.trim() === "فصل";
  const transferConfirmed = ["transfer", "نقل"].includes(confirmTransfer.trim().toLowerCase())
    || confirmTransfer.trim() === "نقل";

  const targetOptions = useMemo(
    () => (companiesQuery.data ?? []).filter((c) => c.id !== companyId),
    [companiesQuery.data, companyId],
  );

  const refreshEvents = useCallback(async () => {
    if (!isWhatsAppLifecycleApiConfigured()) return;
    setEventsLoading(true);
    try {
      const result = await fetchWhatsAppLifecycleEvents(companyId, 10);
      setEvents(result.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  const onDisconnect = async () => {
    if (!window.confirm(t("notifications.whatsapp.settings.lifecycle.disconnectDialog"))) {
      return;
    }
    setBusy("disconnect");
    try {
      if (!disconnectConfirmed) {
        toast({
          title: t("notifications.whatsapp.settings.lifecycle.disconnectFailed"),
          description: t("notifications.whatsapp.settings.lifecycle.typeDisconnect"),
          variant: "destructive",
        });
        return;
      }
      await disconnectWhatsAppConnection({
        companyId,
        confirmPhoneNumberId: phone || null,
        confirmText: confirmDisconnect.trim(),
      });
      toast({ title: t("notifications.whatsapp.settings.lifecycle.disconnectSuccess") });
      setConfirmDisconnect("");
      onChanged?.();
      await refreshEvents();
    } catch (error) {
      toast({
        title: t("notifications.whatsapp.settings.lifecycle.disconnectFailed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onTransfer = async () => {
    if (!phone) {
      toast({
        title: t("notifications.whatsapp.settings.lifecycle.transferFailed"),
        description: t("notifications.whatsapp.settings.lifecycle.missingPhone"),
        variant: "destructive",
      });
      return;
    }
    if (!targetCompanyId) {
      toast({
        title: t("notifications.whatsapp.settings.lifecycle.transferFailed"),
        description: t("notifications.whatsapp.settings.lifecycle.pickTarget"),
        variant: "destructive",
      });
      return;
    }
    if (!transferConfirmed) {
      toast({
        title: t("notifications.whatsapp.settings.lifecycle.transferFailed"),
        description: t("notifications.whatsapp.settings.lifecycle.typeTransfer"),
        variant: "destructive",
      });
      return;
    }
    if (!window.confirm(t("notifications.whatsapp.settings.lifecycle.transferDialog"))) {
      return;
    }
    setBusy("transfer");
    try {
      await transferWhatsAppConnection({
        companyId,
        toCompanyId: targetCompanyId,
        confirmPhoneNumberId: phone,
        confirmText: confirmTransfer.trim(),
      });
      toast({ title: t("notifications.whatsapp.settings.lifecycle.transferSuccess") });
      setConfirmTransfer("");
      setTargetCompanyId("");
      onChanged?.();
      await refreshEvents();
    } catch (error) {
      toast({
        title: t("notifications.whatsapp.settings.lifecycle.transferFailed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DashboardCard className="p-6 space-y-5" data-testid="whatsapp-connection-lifecycle-panel">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">{t("notifications.whatsapp.settings.lifecycle.title")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("notifications.whatsapp.settings.lifecycle.description")}
      </p>

      <div className="rounded-lg bg-muted/40 p-3 space-y-2 text-sm">
        <p>
          <span className="font-medium">{t("notifications.whatsapp.settings.lifecycle.status")}: </span>
          {bound
            ? enabled
              ? t("notifications.whatsapp.settings.lifecycle.statusConnected")
              : t("notifications.whatsapp.settings.lifecycle.statusDisabled")
            : t("notifications.whatsapp.settings.lifecycle.statusDisconnected")}
        </p>
        <p>
          <span className="font-medium">{t("notifications.whatsapp.settings.lifecycle.company")}: </span>
          {companyName || companyId}
        </p>
        {phone ? (
          <p className="text-xs text-muted-foreground">phone_number_id: {phone}</p>
        ) : null}
        {businessAccountId ? (
          <p className="text-xs text-muted-foreground">WABA: {businessAccountId}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("notifications.whatsapp.settings.lifecycle.metaNote")}
        </p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Unplug className="w-3.5 h-3.5" />
          {t("notifications.whatsapp.settings.lifecycle.disconnectTitle")}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t("notifications.whatsapp.settings.lifecycle.disconnectHint")}
        </p>
        <div className="space-y-2">
          <Label htmlFor="wa-disconnect-confirm">
            {t("notifications.whatsapp.settings.lifecycle.typeDisconnect")}
          </Label>
          <Input
            id="wa-disconnect-confirm"
            value={confirmDisconnect}
            onChange={(e) => setConfirmDisconnect(e.target.value)}
            placeholder="disconnect"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!bound || !disconnectConfirmed || busy !== null}
          data-testid="whatsapp-lifecycle-disconnect"
          onClick={() => void onDisconnect()}
        >
          {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {t("notifications.whatsapp.settings.lifecycle.disconnectCta")}
        </Button>
      </div>

      {isSuperAdmin ? (
        <div className="space-y-3 border-t pt-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            {t("notifications.whatsapp.settings.lifecycle.transferTitle")}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t("notifications.whatsapp.settings.lifecycle.transferHint")}
          </p>
          <div className="space-y-2">
            <Label>{t("notifications.whatsapp.settings.lifecycle.targetCompany")}</Label>
            <Select value={targetCompanyId} onValueChange={setTargetCompanyId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t("notifications.whatsapp.settings.lifecycle.pickTarget")}
                />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-transfer-confirm">
              {t("notifications.whatsapp.settings.lifecycle.typeTransfer")}
            </Label>
            <Input
              id="wa-transfer-confirm"
              value={confirmTransfer}
              onChange={(e) => setConfirmTransfer(e.target.value)}
              placeholder="transfer"
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!bound || !phone || !targetCompanyId || !transferConfirmed || busy !== null}
            data-testid="whatsapp-lifecycle-transfer"
            onClick={() => void onTransfer()}
          >
            {busy === "transfer" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("notifications.whatsapp.settings.lifecycle.transferCta")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground border-t pt-4">
          {t("notifications.whatsapp.settings.lifecycle.transferSuperAdminOnly")}
        </p>
      )}

      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            {t("notifications.whatsapp.settings.lifecycle.historyTitle")}
          </h4>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={eventsLoading}
            onClick={() => void refreshEvents()}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${eventsLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("notifications.whatsapp.settings.lifecycle.historyEmpty")}
          </p>
        ) : (
          <ul className="space-y-2 text-xs text-muted-foreground">
            {events.map((event) => (
              <li key={event.id} className="rounded-md border p-2">
                <div className="font-medium text-foreground">
                  {event.action} · {event.status}
                </div>
                <div>{new Date(event.created_at).toLocaleString()}</div>
                {event.phone_number_id ? <div>phone: {event.phone_number_id}</div> : null}
                {event.to_company_id ? <div>→ {event.to_company_id}</div> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t("notifications.whatsapp.settings.lifecycle.reconnectHint")}
        </p>
      </div>
    </DashboardCard>
  );
}
