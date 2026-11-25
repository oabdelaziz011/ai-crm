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
import {
  formatMessengerRedirectUriHint,
  formatMetaOauthReadinessMessage,
} from "@/lib/channels/meta-oauth-readiness-message";

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
          .then(async (result) => {
            setPendingState(state);
            setPages(result.pages);
            const onlyPageId = result.pages[0]?.pageId ?? "";
            setSelectedPageId(onlyPageId);
            // Single Page: finish immediately so reconnect cannot stall on "select only".
            if (result.pages.length === 1 && onlyPageId) {
              const completed = await completeMetaMessengerLogin({
                companyId,
                state,
                pageId: onlyPageId,
                confirmReplaceExisting: true,
              });
              setPendingState(null);
              setPages([]);
              if (completed.webhookVerifyToken) {
                setRevealedVerifyToken(completed.webhookVerifyToken);
              }
              toast({
                title: completed.connected
                  ? t("notifications.messengerLogin.connected", {
                      defaultValue: "Messenger connected",
                    })
                  : t("notifications.messengerLogin.savedNotConnected", {
                      defaultValue: "Saved — not fully Connected",
                    }),
                description: completed.message,
                variant: completed.connected ? "default" : "destructive",
              });
              onConnected?.();
              void refresh();
              return;
            }
            toast({
              title: t("notifications.messengerLogin.selectPage", {
                defaultValue: "Select a Facebook Page",
              }),
              description: t("notifications.messengerLogin.selectPageThenSave", {
                defaultValue: "Select the Page, then press Save & verify to store a fresh token.",
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
      const rawMessage = params.get("message") || params.get("reason") || "";
      const blocked =
        /url\s*blocked|redirect_uri|redirect uri|valid oauth redirect/i.test(rawMessage) ||
        /PLATFORM__INVALID|OAuthException/i.test(rawMessage);
      toast({
        title: t("notifications.messengerLogin.failed", {
          defaultValue: "Messenger connection failed",
        }),
        description: blocked
          ? formatMessengerRedirectUriHint(readiness)
          : rawMessage || undefined,
        variant: "destructive",
      });
      cleanup();
    }
  }, [companyId, onConnected, readiness, refresh, t, toast]);

  const onConnect = async () => {
    const replacing = Boolean(connection?.hasAccessToken);
    if (replacing) {
      const ok = window.confirm(
        t("notifications.messengerLogin.confirmReplace", {
          defaultValue:
            "Messenger already has credentials. Reconnecting will replace the existing Page token. Continue?",
        }),
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const session = await startMetaMessengerLogin(companyId, {
        confirmReplaceExisting: replacing,
      });
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
      // Pending OAuth session is explicit reconnect intent — always replace stored Page token.
      const result = await completeMetaMessengerLogin({
        companyId,
        state: pendingState,
        pageId: selectedPageId,
        confirmReplaceExisting: true,
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
    const isManual = connection?.credentialSource !== "oauth";
    let confirmClearCredentials = false;
    if (isManual) {
      const softOk = window.confirm(
        t("notifications.messengerLogin.confirmDisableManual", {
          defaultValue:
            "Disable Messenger for this company? Manual credentials stay encrypted unless you also choose to clear them.",
        }),
      );
      if (!softOk) return;
      confirmClearCredentials = window.confirm(
        t("notifications.messengerLogin.confirmClearManualSecrets", {
          defaultValue:
            "Also permanently clear manual access/verify tokens? Cancel keeps secrets and only disables the channel.",
        }),
      );
    } else {
      const ok = window.confirm(
        t("notifications.messengerLogin.confirmClearOauth", {
          defaultValue:
            "Disconnect Messenger OAuth and clear stored Page credentials for this company?",
        }),
      );
      if (!ok) return;
      confirmClearCredentials = true;
    }
    setBusy(true);
    try {
      const result = await disconnectMetaMessengerLogin(companyId, {
        confirmClearCredentials,
      });
      toast({
        title: result.softDisableOnly
          ? t("notifications.messengerLogin.disabledKeptSecrets", {
              defaultValue: "Messenger disabled — manual credentials preserved",
            })
          : t("notifications.messengerLogin.disconnected", {
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

  const statusLabel = t(
    `notifications.messengerLogin.statusLabels.${connection?.status ?? "not_connected"}`,
    {
      defaultValue: connection
        ? META_CONNECTION_STATUS_LABELS[connection.status]
        : META_CONNECTION_STATUS_LABELS.not_connected,
    },
  );
  const connectDisabled = busy || readiness?.ready !== true;
  const readinessMessage = formatMetaOauthReadinessMessage(readiness, "messenger");
  const connectLabel = connection?.hasAccessToken
    ? t("notifications.messengerLogin.reconnect", { defaultValue: "Reconnect Messenger" })
    : t("notifications.messengerLogin.connect", { defaultValue: "Connect Facebook Messenger" });
  const needsReconnect =
    connection?.status === "connection_expired" ||
    connection?.status === "reauthorization_required" ||
    /session has expired|error validating access token/i.test(String(connection?.lastError ?? ""));

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
      {needsReconnect ? (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200"
          role="status"
          data-testid="messenger-token-expired-banner"
        >
          {t("notifications.messengerLogin.tokenExpiredBanner", {
            defaultValue:
              "Page access token expired or invalid. Click Reconnect, authorize Facebook, select the Page, then press Save & verify — Facebook Login alone is not enough.",
          })}
        </div>
      ) : null}
      {readinessMessage ? (
        <div
          className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300"
          role="status"
          data-oauth-ready="false"
          data-oauth-reason={readiness?.reason ?? "unknown"}
        >
          <p className="font-medium">
            {t("notifications.messengerLogin.connectDisabled", {
              defaultValue: "Connect Facebook Messenger is disabled",
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
      <p
        className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground"
        data-testid="messenger-oauth-redirect-hint"
      >
        {t("notifications.messengerLogin.redirectUriHint", {
          defaultValue: formatMessengerRedirectUriHint(readiness),
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={connectDisabled}
          aria-disabled={connectDisabled}
          title={
            connectDisabled
              ? readinessMessage ??
                t("notifications.messengerLogin.connectDisabled", {
                  defaultValue: "Connect Facebook Messenger is disabled",
                })
              : undefined
          }
          onClick={() => void onConnect()}
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {connectLabel}
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
