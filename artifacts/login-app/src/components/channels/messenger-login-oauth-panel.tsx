import { useCallback, useEffect, useState } from "react";
import { Facebook, Loader2, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  completeMetaMessengerLogin,
  disconnectMetaMessengerLogin,
  fetchMetaMessengerLoginConnection,
  fetchMetaMessengerLoginStatus,
  fetchPendingMessengerPages,
  isMetaMessengerLoginUiEnabled,
  startMetaMessengerLogin,
  type MetaMessengerLoginConnection,
  type MetaMessengerLoginReadiness,
} from "@/lib/channels/meta-messenger-login-client";
import { META_CONNECTION_STATUS_LABELS } from "@/lib/channels/meta-connection-status";

type Props = {
  companyId: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

export function MessengerLoginOauthPanel({ companyId, onConnected, onDisconnected }: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const uiEnabled = isMetaMessengerLoginUiEnabled();
  const [readiness, setReadiness] = useState<MetaMessengerLoginReadiness | null>(null);
  const [connection, setConnection] = useState<MetaMessengerLoginConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<Array<{ pageId: string; name: string }>>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [pendingState, setPendingState] = useState<string | null>(null);
  /** One-time reveal after OAuth complete — required for Meta Dashboard webhook verification. */
  const [revealedVerifyToken, setRevealedVerifyToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [status, conn] = await Promise.all([
        fetchMetaMessengerLoginStatus(companyId),
        fetchMetaMessengerLoginConnection(companyId).catch(() => null),
      ]);
      setReadiness(status);
      setConnection(conn);
    } catch {
      setReadiness({ ready: false, companyAllowed: false, reason: "MSL_DISABLED" });
    }
  }, [companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("messenger_oauth");
    if (!outcome) return;

    const cleanup = () => {
      params.delete("messenger_oauth");
      params.delete("state");
      params.delete("page_count");
      params.delete("reason");
      params.delete("message");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    };

    if (outcome === "select_page") {
      const state = params.get("state");
      if (state) {
        setBusy(true);
        void fetchPendingMessengerPages(companyId, state)
          .then((result) => {
            setPendingState(state);
            setPages(result.pages);
            setSelectedPageId(result.pages[0]?.pageId ?? "");
            toast({
              title: t("notifications.messengerLogin.selectPage", {
                defaultValue: "Select a Facebook Page",
              }),
            });
          })
          .catch((error) => {
            toast({
              title: t("notifications.messengerLogin.pagesFailed", {
                defaultValue: "Could not load Pages",
              }),
              description: error instanceof Error ? error.message : String(error),
              variant: "destructive",
            });
          })
          .finally(() => setBusy(false));
      }
      cleanup();
      return;
    }

    if (outcome === "error") {
      toast({
        title: t("notifications.messengerLogin.failed", {
          defaultValue: "Messenger connection failed",
        }),
        description: params.get("message") || params.get("reason") || undefined,
        variant: "destructive",
      });
      cleanup();
    }
  }, [companyId, t, toast]);

  const onConnect = async () => {
    setBusy(true);
    try {
      const session = await startMetaMessengerLogin(companyId);
      window.location.assign(session.authorizeUrl);
    } catch (error) {
      toast({
        title: t("notifications.messengerLogin.startFailed", {
          defaultValue: "Could not start Facebook Login",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (!pendingState || !selectedPageId) return;
    setBusy(true);
    try {
      const result = await completeMetaMessengerLogin({
        companyId,
        state: pendingState,
        pageId: selectedPageId,
      });
      setPendingState(null);
      setPages([]);
      if (result.webhookVerifyToken) {
        setRevealedVerifyToken(result.webhookVerifyToken);
      }
      toast({
        title: result.connected
          ? t("notifications.messengerLogin.connected", { defaultValue: "Messenger connected" })
          : t("notifications.messengerLogin.savedNotConnected", {
              defaultValue: "Saved — not fully Connected",
            }),
        description: result.message,
        variant: result.connected ? "default" : "destructive",
      });
      onConnected?.();
      void refresh();
    } catch (error) {
      toast({
        title: t("notifications.messengerLogin.completeFailed", {
          defaultValue: "Could not complete Messenger connection",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectMetaMessengerLogin(companyId);
      toast({
        title: t("notifications.messengerLogin.disconnected", {
          defaultValue: "Messenger soft-disconnected",
        }),
      });
      onDisconnected?.();
      void refresh();
    } catch (error) {
      toast({
        title: t("notifications.messengerLogin.disconnectFailed", {
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
        {t("notifications.messengerLogin.uiDisabled", {
          defaultValue:
            "Messenger Facebook Login self-service is disabled (VITE_META_MESSENGER_OAUTH_ENABLED / VITE_META_PAGES_OAUTH_ENABLED).",
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
        <Facebook className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">
          {t("notifications.messengerLogin.title", {
            defaultValue: "Connect Facebook Messenger",
          })}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("notifications.messengerLogin.hint", {
          defaultValue:
            "Uses Facebook Login for Business. Authorize, then select the Facebook Page to connect. Page tokens stay on the server — never a platform System User token.",
        })}
      </p>
      <p className="text-xs">
        <span className="text-muted-foreground">
          {t("notifications.messengerLogin.status", { defaultValue: "Status" })}:{" "}
        </span>
        {statusLabel}
        {connection?.pageName ? ` · ${connection.pageName}` : ""}
      </p>
      {readiness && !readiness.ready ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("notifications.messengerLogin.notReady", {
            reason: readiness.reason ?? "unknown",
            defaultValue: `Self-service not ready (${readiness.reason ?? "unknown"}).`,
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || readiness?.ready === false} onClick={() => void onConnect()}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {connection?.hasAccessToken
            ? t("notifications.messengerLogin.reconnect", { defaultValue: "Reconnect Messenger" })
            : t("notifications.messengerLogin.connect", { defaultValue: "Connect Facebook Messenger" })}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onDisconnect()}>
          <Unplug className="mr-1.5 h-3.5 w-3.5" />
          {t("notifications.messengerLogin.disconnect", { defaultValue: "Disconnect" })}
        </Button>
      </div>
      {pages.length > 0 && pendingState ? (
        <div className="space-y-2">
          <Label>
            {t("notifications.messengerLogin.selectPageLabel", { defaultValue: "Select Facebook Page" })}
          </Label>
          <Select value={selectedPageId} onValueChange={setSelectedPageId}>
            <SelectTrigger>
              <SelectValue placeholder="Page" />
            </SelectTrigger>
            <SelectContent>
              {pages.map((page) => (
                <SelectItem key={page.pageId} value={page.pageId}>
                  {page.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={busy || !selectedPageId} onClick={() => void onComplete()}>
            {t("notifications.messengerLogin.finish", { defaultValue: "Save & verify connection" })}
          </Button>
        </div>
      ) : null}
      {revealedVerifyToken ? (
        <div
          className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2"
          data-testid="messenger-oauth-verify-token-once"
        >
          <p className="text-xs font-medium">
            {t("notifications.messengerLogin.verifyTokenOnceTitle", {
              defaultValue: "Webhook verify token (copy once into Meta App Dashboard)",
            })}
          </p>
          <code className="block break-all text-xs">{revealedVerifyToken}</code>
          <p className="text-[11px] text-muted-foreground">
            {t("notifications.messengerLogin.verifyTokenOnceHint", {
              defaultValue:
                "Callback URL: https://webhook.valueor.org/api/webhooks/messenger — this plaintext is shown once after connect.",
            })}
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRevealedVerifyToken(null)}>
            {t("notifications.messengerLogin.verifyTokenDismiss", { defaultValue: "Hide token" })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
