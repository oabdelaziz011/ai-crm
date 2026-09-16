import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "@/hooks/use-rbac";
import { useSmsControlCenter } from "@/hooks/sms/use-sms-control-center";
import { DashboardCard } from "@/components/dashboard/ui";

export function SmsSetupStatusCard() {
  const { t } = useTranslation("common");
  const canConfigure = useHasPermission("settings.edit");
  const { isLoading, status, configured, enabled, provider, fromNumber } = useSmsControlCenter();

  if (isLoading) return null;

  const statusLabel =
    status === "disabled"
      ? t("smsModule.setup.disabled")
      : status === "connected"
        ? t("smsModule.setup.connected")
        : t("smsModule.setup.notConnected");

  return (
    <DashboardCard className="p-3" data-testid="sms-setup-status-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{t("smsModule.setup.title")}</p>
          <p className="text-xs text-muted-foreground">
            {statusLabel}
            {provider ? ` · ${provider}` : ""}
            {fromNumber ? ` · ${fromNumber}` : ""}
            {!enabled && configured ? ` · ${t("smsModule.setup.disabled")}` : ""}
          </p>
        </div>
        {canConfigure ? (
          <Link
            href="~/dashboard/settings/sms"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            {t("smsModule.setup.configure")}
          </Link>
        ) : null}
      </div>
    </DashboardCard>
  );
}
