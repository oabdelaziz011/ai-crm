import { useCallback, useEffect, useState } from "react";
import { Instagram, Loader2, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  disconnectMetaInstagramLogin,
  fetchMetaInstagramLoginConnection,
  fetchMetaInstagramLoginStatus,
  isMetaInstagramLoginUiEnabled,
  refreshMetaInstagramLoginToken,
  startMetaInstagramLogin,
  type MetaInstagramLoginConnection,
  type MetaInstagramLoginReadiness,
} from "@/lib/channels/meta-instagram-login-client";
import { formatMetaOauthReadinessMessage } from "@/lib/channels/meta-oauth-readiness-message";
import type { MetaChannelConnectionStatusUi } from "@/components/channels/meta-channel-connection-strip";

type Props = {
  companyId: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

export function InstagramLoginOauthPanel({ companyId, onConnected, onDisconnected }: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const uiEnabled = isMetaInstagramLoginUiEnabled();
  const [readiness, setReadiness] = useState<MetaInstagramLoginReadiness | null>(null);
  const [connection, setConnection] = useState<MetaInstagramLoginConnection | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [status, conn] = await Promise.all([
        fetchMetaInstagramLoginStatus(companyId),
        fetchMetaInstagramLoginConnection(companyId).catch(() => null),
      ]);
      setReadiness(status);
      setConnection(conn);
    } catch {
      setReadiness({ ready: false, companyAllowed: false, reason: "IGL_DISABLED" });
    }
  }, [companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("instagram_oauth");
    if (!outcome) return;
    if (outcome === "connected" || outcome === "webhook_failed") {
      toast({
        title:
          outcome === "connected"
            ? t("notifications.instagramLogin.connected", { defaultValue: "Instagram connected" })
            : t("notifications.instagramLogin.webhookFailed", {
                defaultValue: "Instagram saved — webhook subscription failed",
              }),
        description: params.get("username")
          ? `@${params.get("username")}`
          : params.get("message") ?? undefined,
        variant: outcome === "connected" ? "default" : "destructive",
      });
      onConnected?.();
      void refresh();
    } else if (outcome === "error") {
      toast({
        title: t("notifications.instagramLogin.failed", { defaultValue: "Instagram connection failed" }),
        description: params.get("message") || params.get("reason") || undefined,
        variant: "destructive",
      });
    }
    params.delete("instagram_oauth");
    params.delete("username");
    params.delete("ig_user_id");
    params.delete("connection_status");
    params.delete("reason");
    params.delete("message");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [onConnected, refresh, t, toast]);

  const onConnect = async () => {
    const replacing = Boolean(connection?.hasAccessToken);
    if (replacing) {
      const ok = window.confirm(
        t("notifications.instagramLogin.confirmReplace", {
          defaultValue:
            "Instagram already has credentials. Reconnecting will replace the existing token. Continue?",
        }),
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const session = await startMetaInstagramLogin(companyId, {
        confirmReplaceExisting: replacing,
      });
      window.location.assign(session.authorizeUrl);
    } catch (error) {
      toast({
        title: t("notifications.instagramLogin.startFailed", {
          defaultValue: "Could not start Instagram Login",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    const isManual = connection?.credentialSource !== "oauth";
    let confirmClearCredentials = false;
    if (isManual) {
      const softOk = window.confirm(
        t("notifications.instagramLogin.confirmDisableManual", {
          defaultValue:
            "Disable Instagram for this company? Manual credentials stay encrypted unless you also choose to clear them.",
        }),
      );
      if (!softOk) return;
      confirmClearCredentials = window.confirm(
        t("notifications.instagramLogin.confirmClearManualSecrets", {
          defaultValue:
            "Also permanently clear manual access/verify tokens? Cancel keeps secrets and only disables the channel.",
        }),
      );
    } else {
      const ok = window.confirm(
        t("notifications.instagramLogin.confirmClearOauth", {
          defaultValue:
            "Disconnect Instagram OAuth and clear stored credentials for this company?",
        }),
      );
      if (!ok) return;
      confirmClearCredentials = true;
    }
    setBusy(true);
    try {
      const result = await disconnectMetaInstagramLogin(companyId, {
        confirmClearCredentials,
      });
      toast({
        title: result.softDisableOnly
          ? t("notifications.instagramLogin.disabledKeptSecrets", {
              defaultValue: "Instagram disabled — manual credentials preserved",
            })
          : t("notifications.instagramLogin.disconnected", {
              defaultValue: "Instagram soft-disconnected",
            }),
      });
      onDisconnected?.();
      void refresh();
    } catch (error) {
      toast({
        title: t("notifications.instagramLogin.disconnectFailed", {
          defaultValue: "Disconnect failed",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onRefreshToken = async () => {
    setBusy(true);
    try {
      const result = await refreshMetaInstagramLoginToken(companyId);
      toast({
        title: result.ok
          ? t("notifications.instagramLogin.refreshed", { defaultValue: "Instagram token refreshed" })
          : t("notifications.instagramLogin.refreshFailed", {
              defaultValue: "Token refresh failed — reconnect",
            }),
        description: result.message,
        variant: result.ok ? "default" : "destructive",
      });
      if (!result.ok) {
        // Expired/revoked — fall through to full OAuth reconnect UX.
      }
      void refresh();
      onConnected?.();
    } catch (error) {
      toast({
        title: t("notifications.instagramLogin.refreshFailed", {
          defaultValue: "Token refresh failed — reconnect",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!uiEnabled) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("notifications.instagramLogin.uiDisabled", {
          defaultValue:
            "Instagram Login self-service is disabled (VITE_META_INSTAGRAM_LOGIN_ENABLED / VITE_META_PAGES_OAUTH_ENABLED).",
        })}
      </p>
    );
  }

  const statusKey = (connection?.status ?? "not_connected") as MetaChannelConnectionStatusUi;
  const statusLabel = t(`notifications.metaPagesOauth.status.${statusKey}`, {
    defaultValue: statusKey.replaceAll("_", " "),
  });
  const connectDisabled = busy || readiness?.ready !== true;
  const readinessMessage = formatMetaOauthReadinessMessage(readiness, "instagram");
  const connectLabel =
    connection?.status === "connection_expired" ||
    connection?.status === "reauthorization_required" ||
    connection?.hasAccessToken
      ? t("notifications.instagramLogin.reconnect")
      : t("notifications.instagramLogin.connect");

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <Instagram className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">
          {t("notifications.instagramLogin.title", {
            defaultValue: "Connect Instagram (Instagram Login)",
          })}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("notifications.instagramLogin.hint", {
          defaultValue:
            "Uses Instagram API with Instagram Login (graph.instagram.com). Professional Business/Creator accounts only. Tokens stay on the server.",
        })}
      </p>
      <p className="text-xs">
        <span className="text-muted-foreground">
          {t("notifications.instagramLogin.status", { defaultValue: "Status" })}:{" "}
        </span>
        {statusLabel}
        {connection?.username ? ` · @${connection.username}` : ""}
      </p>
      {readinessMessage ? (
        <div
          className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300"
          role="status"
          data-oauth-ready="false"
          data-oauth-reason={readiness?.reason ?? "unknown"}
        >
          <p className="font-medium">
            {t("notifications.instagramLogin.connectDisabled", {
              defaultValue: "Connect Instagram is disabled",
            })}
          </p>
          <p>{readinessMessage}</p>
          {readiness?.missingConfigKeys && readiness.missingConfigKeys.length > 0 ? (
            <ul className="list-disc pl-4 font-mono text-[11px]">
              {readiness.missingConfigKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={connectDisabled}
          aria-disabled={connectDisabled}
          title={
            connectDisabled
              ? readinessMessage ??
                t("notifications.instagramLogin.connectDisabled", {
                  defaultValue: "Connect Instagram is disabled",
                })
              : undefined
          }
          onClick={() => void onConnect()}
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {connectLabel}
        </Button>
        {connection?.hasAccessToken && connection.status === "connection_expired" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={connectDisabled}
            onClick={() => void onRefreshToken()}
          >
            {t("notifications.instagramLogin.refresh", { defaultValue: "Refresh token" })}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onDisconnect()}>
          <Unplug className="mr-1.5 h-3.5 w-3.5" />
          {t("notifications.instagramLogin.disconnect", { defaultValue: "Disconnect" })}
        </Button>
      </div>
    </div>
  );
}
