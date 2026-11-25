import { CheckCircle2, CircleAlert, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { resolveMetaConnectionStatus } from "@/lib/channels/meta-connection-status";

export type MetaChannelConnectionStatusUi =
  | "connected"
  | "not_connected"
  | "connection_expired"
  | "reauthorization_required"
  | "webhook_subscription_failed";

export type MetaChannelConnectionStripProps = {
  channelLabel: string;
  /** True only after credentials + health verification — never OAuth alone. */
  connected: boolean;
  enabled: boolean;
  /** Preferred explicit lifecycle status when available from OAuth connection API. */
  connectionStatus?: MetaChannelConnectionStatusUi | null;
  assetLabel?: string | null;
  assetValue?: string | null;
  hasAccessToken: boolean;
  hasWebhookVerifyToken: boolean;
  healthOk?: boolean | null;
  healthError?: string | null;
  lastVerifiedLabel?: string | null;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  disconnectBusy?: boolean;
};

/**
 * Shared Omnichannel connection summary for Messenger / Instagram settings.
 * Does not display secrets.
 */
const STATUS_DEFAULTS: Record<MetaChannelConnectionStatusUi, string> = {
  connected: "Connected",
  not_connected: "Not Connected",
  connection_expired: "Connection Expired",
  reauthorization_required: "Reauthorization Required",
  webhook_subscription_failed: "Webhook Subscription Failed",
};

export function MetaChannelConnectionStrip({
  channelLabel,
  connected,
  enabled,
  connectionStatus,
  assetLabel,
  assetValue,
  hasAccessToken,
  hasWebhookVerifyToken,
  healthOk,
  healthError,
  lastVerifiedLabel,
  onReconnect,
  onDisconnect,
  disconnectBusy,
}: MetaChannelConnectionStripProps) {
  const { t } = useTranslation("common");
  const resolvedStatus: MetaChannelConnectionStatusUi =
    connectionStatus ??
    resolveMetaConnectionStatus({
      enabled,
      hasAccessToken,
      healthOk,
      stored: connected ? "connected" : null,
    });
  const statusLabel = t(`notifications.metaPagesOauth.status.${resolvedStatus}`, {
    defaultValue: STATUS_DEFAULTS[resolvedStatus],
  });

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {connected ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <CircleAlert className="h-4 w-4 text-amber-500" />
          )}
          <div>
            <p className="text-sm font-medium">{channelLabel}</p>
            <p className="text-xs text-muted-foreground">{statusLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onReconnect ? (
            <Button type="button" size="sm" variant="outline" onClick={onReconnect}>
              {t("notifications.metaPagesOauth.reconnect", { defaultValue: "Reconnect" })}
            </Button>
          ) : null}
          {onDisconnect ? (
            <Button type="button" size="sm" variant="outline" disabled={disconnectBusy} onClick={onDisconnect}>
              <Unplug className="mr-1.5 h-3.5 w-3.5" />
              {t("notifications.metaPagesOauth.disconnect", { defaultValue: "Disconnect (soft)" })}
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        {assetLabel ? (
          <div>
            <dt className="text-muted-foreground">{assetLabel}</dt>
            <dd className="font-mono">{assetValue || "—"}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">
            {t("notifications.metaPagesOauth.tokenStatus", { defaultValue: "Access token" })}
          </dt>
          <dd>
            {hasAccessToken
              ? t("notifications.metaPagesOauth.present", { defaultValue: "present" })
              : t("notifications.metaPagesOauth.missing", { defaultValue: "missing" })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("notifications.metaPagesOauth.webhookTokenStatus", { defaultValue: "Webhook verify token" })}
          </dt>
          <dd>
            {hasWebhookVerifyToken
              ? t("notifications.metaPagesOauth.present", { defaultValue: "present" })
              : t("notifications.metaPagesOauth.missing", { defaultValue: "missing" })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("notifications.metaPagesOauth.healthStatus", { defaultValue: "Health" })}
          </dt>
          <dd>
            {healthOk === true
              ? t("notifications.metaPagesOauth.healthOkShort", { defaultValue: "ok" })
              : healthOk === false
                ? `${t("notifications.metaPagesOauth.healthFailedShort", { defaultValue: "failed" })}${
                    healthError ? `: ${healthError}` : ""
                  }`
                : t("notifications.metaPagesOauth.healthNotRun", { defaultValue: "not run" })}
          </dd>
        </div>
        {lastVerifiedLabel ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              {t("notifications.metaPagesOauth.lastVerified", { defaultValue: "Last verification" })}
            </dt>
            <dd>{lastVerifiedLabel}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-[11px] text-muted-foreground">
        {t("notifications.metaPagesOauth.connectedRule", {
          defaultValue:
            "Connected requires selected asset, valid token, webhook readiness, and a successful health check. OAuth success alone is never enough.",
        })}
      </p>
    </div>
  );
}
