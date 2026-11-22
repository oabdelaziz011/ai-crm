import { useCallback, useEffect, useState } from "react";
import { Loader2, Link2, Unplug } from "lucide-react";
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
import { asFacebookLoginCallback } from "@/lib/channels/whatsapp-facebook-login";
import { isMetaPagesOauthUiEnabled } from "@/lib/channels/meta-pages-oauth-flags";
import {
  completeMetaPagesOauth,
  createMetaPagesOauthSession,
  disconnectMetaPagesOauth,
  discoverMetaPageAssets,
  fetchMetaPagesOauthStatus,
  type MetaPageAssetPublic,
  type MetaPagesOauthChannel,
  type MetaPagesOauthReadiness,
} from "@/lib/channels/meta-pages-oauth-client";

type Props = {
  companyId: string;
  channel: MetaPagesOauthChannel;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: { authResponse?: { code?: string } | null }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, cookie: true, xfbml: false, version });
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version });
      resolve();
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
    document.body.appendChild(script);
  });
}

export function MetaPagesOauthPanel({ companyId, channel, onConnected, onDisconnected }: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const uiEnabled = isMetaPagesOauthUiEnabled();
  const [readiness, setReadiness] = useState<MetaPagesOauthReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<MetaPageAssetPublic[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [pendingAuth, setPendingAuth] = useState<{ code: string; state: string } | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await fetchMetaPagesOauthStatus(companyId);
      setReadiness(status);
    } catch {
      setReadiness({ ready: false, companyAllowed: false, reason: "MPO_DISABLED" });
    }
  }, [companyId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const startOAuth = async () => {
    setBusy(true);
    try {
      const session = await createMetaPagesOauthSession({ companyId, channel });
      await loadFacebookSdk(session.appId, session.graphApiVersion);
      await new Promise<void>((resolve, reject) => {
        if (!window.FB) {
          reject(new Error("Facebook SDK unavailable"));
          return;
        }
        window.FB.login(
          asFacebookLoginCallback(async (response) => {
            const code = response.authResponse?.code;
            if (!code) {
              reject(new Error("Meta authorization was cancelled or returned no code."));
              return;
            }
            const discovered = await discoverMetaPageAssets({
              companyId,
              channel,
              code,
              state: session.state,
            });
            setPages(discovered.pages);
            setPendingAuth({ code, state: session.state });
            setSelectedPageId(discovered.pages[0]?.pageId ?? "");
            resolve();
          }),
          {
            scope: session.scopes.join(","),
            return_scopes: true,
            response_type: "code",
          },
        );
      });
      toast({
        title: t("notifications.metaPagesOauth.assetsReady", {
          defaultValue: "Select a Facebook Page to continue",
        }),
      });
    } catch (error) {
      toast({
        title: t("notifications.metaPagesOauth.startFailed", {
          defaultValue: "Could not start Meta Login",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const finishOAuth = async () => {
    if (!pendingAuth || !selectedPageId) return;
    setBusy(true);
    try {
      const page = pages.find((row) => row.pageId === selectedPageId);
      const result = await completeMetaPagesOauth({
        companyId,
        channel,
        code: pendingAuth.code,
        state: pendingAuth.state,
        pageId: selectedPageId,
        instagramBusinessAccountId: page?.instagramBusinessAccountId,
      });
      setPendingAuth(null);
      setPages([]);
      toast({
        title: result.connected
          ? t("notifications.metaPagesOauth.connected", { defaultValue: "Channel verified" })
          : t("notifications.metaPagesOauth.savedNotConnected", {
              defaultValue: "Saved — not Connected yet",
            }),
        description: result.message,
        variant: result.connected ? "default" : "destructive",
      });
      onConnected?.();
      void refreshStatus();
    } catch (error) {
      toast({
        title: t("notifications.metaPagesOauth.completeFailed", {
          defaultValue: "Could not complete Meta connection",
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
      await disconnectMetaPagesOauth({ companyId, channel });
      toast({
        title: t("notifications.metaPagesOauth.disconnected", {
          defaultValue: "Soft-disconnected in ValueOR",
        }),
        description: t("notifications.metaPagesOauth.disconnectHint", {
          defaultValue:
            "Credentials cleared locally. Meta app unsubscribe / token revoke is not performed automatically.",
        }),
      });
      onDisconnected?.();
    } catch (error) {
      toast({
        title: t("notifications.metaPagesOauth.disconnectFailed", {
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
        {t("notifications.metaPagesOauth.uiDisabled", {
          defaultValue:
            "Meta Login self-service is disabled in this environment (VITE_META_PAGES_OAUTH_ENABLED). Manual credentials remain available below.",
        })}
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">
          {channel === "instagram"
            ? t("notifications.metaPagesOauth.instagramTitle", {
                defaultValue: "Connect Instagram via Meta Login",
              })
            : t("notifications.metaPagesOauth.messengerTitle", {
                defaultValue: "Connect Facebook Page via Meta Login",
              })}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("notifications.metaPagesOauth.prereq", {
          defaultValue:
            "Requires Meta App products + Advanced Access for messaging scopes. Connected is set only after asset selection and token health verification — not OAuth alone.",
        })}
      </p>
      {readiness && !readiness.ready ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("notifications.metaPagesOauth.notReady", {
            reason: readiness.reason ?? "unknown",
            defaultValue: `Self-service not ready (${readiness.reason ?? "unknown"}). Manual token path remains available.`,
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || readiness?.ready === false} onClick={() => void startOAuth()}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {t("notifications.metaPagesOauth.start", { defaultValue: "Start Meta Login" })}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onDisconnect()}>
          <Unplug className="mr-1.5 h-3.5 w-3.5" />
          {t("notifications.metaPagesOauth.disconnect", { defaultValue: "Disconnect (soft)" })}
        </Button>
      </div>
      {pages.length > 0 && pendingAuth ? (
        <div className="space-y-2">
          <Label>{t("notifications.metaPagesOauth.selectPage", { defaultValue: "Select Facebook Page" })}</Label>
          <Select value={selectedPageId} onValueChange={setSelectedPageId}>
            <SelectTrigger>
              <SelectValue placeholder="Page" />
            </SelectTrigger>
            <SelectContent>
              {pages.map((page) => (
                <SelectItem key={page.pageId} value={page.pageId}>
                  {page.name}
                  {page.instagramUsername ? ` · @${page.instagramUsername}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={busy || !selectedPageId} onClick={() => void finishOAuth()}>
            {t("notifications.metaPagesOauth.finish", { defaultValue: "Save & verify connection" })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
