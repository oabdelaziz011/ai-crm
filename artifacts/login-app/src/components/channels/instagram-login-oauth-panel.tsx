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
  startMetaInstagramLogin,
  type MetaInstagramLoginConnection,
  type MetaInstagramLoginReadiness,
} from "@/lib/channels/meta-instagram-login-client";
import { META_CONNECTION_STATUS_LABELS } from "@/lib/channels/meta-connection-status";

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
    setBusy(true);
    try {
      const session = await startMetaInstagramLogin(companyId);
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
    setBusy(true);
    try {
      await disconnectMetaInstagramLogin(companyId);
      toast({
        title: t("notifications.instagramLogin.disconnected", {
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

  const statusLabel = connection
    ? META_CONNECTION_STATUS_LABELS[connection.status]
    : META_CONNECTION_STATUS_LABELS.not_connected;

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
      {readiness && !readiness.ready ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("notifications.instagramLogin.notReady", {
            reason: readiness.reason ?? "unknown",
            defaultValue: `Self-service not ready (${readiness.reason ?? "unknown"}).`,
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || readiness?.ready === false} onClick={() => void onConnect()}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {connection?.hasAccessToken
            ? t("notifications.instagramLogin.reconnect", { defaultValue: "Reconnect Instagram" })
            : t("notifications.instagramLogin.connect", { defaultValue: "Connect Instagram" })}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onDisconnect()}>
          <Unplug className="mr-1.5 h-3.5 w-3.5" />
          {t("notifications.instagramLogin.disconnect", { defaultValue: "Disconnect" })}
        </Button>
      </div>
    </div>
  );
}
