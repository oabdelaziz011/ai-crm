import { useEffect, useRef, useState } from "react";
import { Loader2, Link2, QrCode, Smartphone, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { useToast } from "@/hooks/use-toast";
import {
  isWhatsAppCoexistenceUiEnabled,
  isWhatsAppEmbeddedSignupUiEnabled,
} from "@/lib/channels/whatsapp-embedded-signup-flags";
import {
  completeWhatsAppEmbeddedSignup,
  createWhatsAppEmbeddedSignupSession,
  fetchWhatsAppEmbeddedSignupStatus,
  isWhatsAppEmbeddedSignupApiConfigured,
  type WhatsAppEmbeddedSignupOnboardingMode,
  type WhatsAppEmbeddedSignupSessionResponse,
} from "@/lib/channels/whatsapp-embedded-signup-client";
import {
  asFacebookLoginCallback,
  type FacebookLoginAuthResponse,
  type FacebookLoginCallback,
} from "@/lib/channels/whatsapp-facebook-login";

type FacebookSdk = {
  init: (opts: Record<string, unknown>) => void;
  /** Meta SDK requires a synchronous callback — never pass an AsyncFunction. */
  login: (cb: FacebookLoginCallback, opts: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

type SessionInfoPayload = {
  type?: string;
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
  current_step?: string;
  event?: string;
  data?: {
    phone_number_id?: string;
    waba_id?: string;
  };
};

function loadFacebookSdk(appId: string, graphVersion: string): Promise<FacebookSdk> {
  if (window.FB) {
    return Promise.resolve(window.FB);
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk");
    window.fbAsyncInit = () => {
      try {
        window.FB?.init({
          appId,
          cookie: true,
          xfbml: false,
          version: graphVersion.startsWith("v") ? graphVersion : `v${graphVersion}`,
        });
        if (!window.FB) {
          reject(new Error("Facebook SDK failed to initialize"));
          return;
        }
        resolve(window.FB);
      } catch (error) {
        reject(error);
      }
    };

    if (!existing) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
      document.body.appendChild(script);
    }
  });
}

export type WhatsAppEmbeddedSignupPanelProps = {
  companyId: string;
  hasExistingConnection?: boolean;
  onCompleted?: () => void;
  /** Soft-disconnect: disable the company WhatsApp channel after explicit confirm. */
  onDisconnect?: () => Promise<void> | void;
};

/**
 * Dual-path WhatsApp self-service onboarding:
 * - Option A: Existing WhatsApp Business App (Meta Coexistence Embedded Signup — Meta owns QR)
 * - Option B: New Cloud API number (Meta Embedded Signup without coexistence featureType)
 *
 * Never fabricates QR codes. Never uses WhatsApp Web pairing.
 */
export function WhatsAppEmbeddedSignupPanel({
  companyId,
  hasExistingConnection = false,
  onCompleted,
  onDisconnect,
}: WhatsAppEmbeddedSignupPanelProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [busyMode, setBusyMode] = useState<WhatsAppEmbeddedSignupOnboardingMode | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusRow, setStatusRow] = useState<Record<string, unknown> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const sessionRef = useRef<WhatsAppEmbeddedSignupSessionResponse | null>(null);
  const pendingPhoneRef = useRef<{
    phoneNumberId?: string;
    businessAccountId?: string;
    businessPortfolioId?: string;
  }>({});

  const uiEnabled = isWhatsAppEmbeddedSignupUiEnabled();
  const coexistenceUi = isWhatsAppCoexistenceUiEnabled();

  const refreshStatus = async () => {
    if (!isWhatsAppEmbeddedSignupApiConfigured() || !uiEnabled) return;
    setStatusLoading(true);
    try {
      const result = await fetchWhatsAppEmbeddedSignupStatus(companyId);
      setStatusRow(result.row);
    } catch {
      setStatusRow(null);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per company
  }, [companyId, uiEnabled]);

  useEffect(() => {
    if (!uiEnabled) return;

    const onMessage = (event: MessageEvent) => {
      if (typeof event.origin !== "string" || !event.origin.includes("facebook.com")) {
        return;
      }
      try {
        const data =
          typeof event.data === "string"
            ? (JSON.parse(event.data) as SessionInfoPayload)
            : (event.data as SessionInfoPayload);
        if (data?.type && data.type !== "WA_EMBEDDED_SIGNUP") {
          return;
        }
        const phoneNumberId = data.phone_number_id ?? data.data?.phone_number_id ?? undefined;
        const wabaId = data.waba_id ?? data.data?.waba_id ?? undefined;
        const businessId = data.business_id ?? undefined;
        if (phoneNumberId || wabaId) {
          pendingPhoneRef.current = {
            phoneNumberId: phoneNumberId ?? pendingPhoneRef.current.phoneNumberId,
            businessAccountId: wabaId ?? pendingPhoneRef.current.businessAccountId,
            businessPortfolioId: businessId ?? pendingPhoneRef.current.businessPortfolioId,
          };
        }
      } catch {
        // Ignore non-JSON postMessages from the iframe.
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [uiEnabled]);

  const onConnect = async (mode: WhatsAppEmbeddedSignupOnboardingMode) => {
    if (!isWhatsAppEmbeddedSignupApiConfigured()) {
      toast({
        title: t("notifications.whatsapp.settings.embeddedSignup.apiMissing"),
        variant: "destructive",
      });
      return;
    }

    if (mode === "coexistence" && !coexistenceUi) {
      toast({
        title: t("notifications.whatsapp.settings.embeddedSignup.coexistenceDisabled"),
        description: t("notifications.whatsapp.settings.embeddedSignup.coexistenceDisabledHint"),
        variant: "destructive",
      });
      return;
    }

    const replaceExisting =
      hasExistingConnection &&
      window.confirm(t("notifications.whatsapp.settings.embeddedSignup.replaceConfirm"));

    if (hasExistingConnection && !replaceExisting) {
      return;
    }

    setBusyMode(mode);
    pendingPhoneRef.current = {};
    try {
      const session = await createWhatsAppEmbeddedSignupSession(companyId, mode);
      sessionRef.current = session;
      const fb = await loadFacebookSdk(session.appId, session.graphApiVersion);

      const extras: Record<string, unknown> = {
        setup: {},
        sessionInfoVersion: "3",
      };
      // Only Coexistence path requests Meta's official featureType (Meta may show QR).
      if (mode === "coexistence" && session.featureType) {
        extras.featureType = session.featureType;
      }

      // Meta FB.login rejects AsyncFunction callbacks — keep this wrapper synchronous.
      const handleLoginResponse = async (response: FacebookLoginAuthResponse) => {
        try {
          const code = response.authResponse?.code?.trim();
          if (!code) {
            toast({
              title: t("notifications.whatsapp.settings.embeddedSignup.cancelled"),
              variant: "destructive",
            });
            return;
          }

          const phoneNumberId = pendingPhoneRef.current.phoneNumberId?.trim() ?? "";
          const businessAccountId = pendingPhoneRef.current.businessAccountId?.trim() ?? "";
          // Coexistence FINISH may return only waba_id; server resolves phone_number_id via Graph.
          if (!businessAccountId || (mode === "cloud_api_new" && !phoneNumberId)) {
            toast({
              title: t("notifications.whatsapp.settings.embeddedSignup.missingSessionInfo"),
              variant: "destructive",
            });
            return;
          }

          const result = await completeWhatsAppEmbeddedSignup({
            companyId,
            code,
            state: session.state,
            phoneNumberId,
            businessAccountId,
            businessPortfolioId: pendingPhoneRef.current.businessPortfolioId ?? null,
            replaceExisting,
            coexistenceEligible: mode === "coexistence",
          });

          toast({
            title: t("notifications.whatsapp.settings.embeddedSignup.success"),
            description:
              result.connectionTestOk === false
                ? t("notifications.whatsapp.settings.embeddedSignup.connectionTestPending")
                : undefined,
          });
          await refreshStatus();
          onCompleted?.();
        } catch (error) {
          const errCode = (error as Error & { code?: string }).code;
          const message = error instanceof Error ? error.message : String(error);
          toast({
            title:
              errCode === "ES_CONNECTION_EXISTS"
                ? t("notifications.whatsapp.settings.embeddedSignup.existingConnection")
                : t("notifications.whatsapp.settings.embeddedSignup.failed"),
            description: message,
            variant: "destructive",
          });
        } finally {
          setBusyMode(null);
        }
      };

      fb.login(asFacebookLoginCallback(handleLoginResponse), {
        config_id: session.configId,
        response_type: "code",
        override_default_response_type: true,
        extras,
      });
    } catch (error) {
      setBusyMode(null);
      const code = (error as Error & { code?: string }).code;
      toast({
        title: t("notifications.whatsapp.settings.embeddedSignup.failed"),
        description:
          code === "ES_META_CONFIG_MISSING"
            ? t("notifications.whatsapp.settings.embeddedSignup.metaConfigMissing")
            : code === "ES_DISABLED"
              ? t("notifications.whatsapp.settings.embeddedSignup.serverDisabled")
              : error instanceof Error
                ? error.message
                : String(error),
        variant: "destructive",
      });
    }
  };

  if (!uiEnabled) {
    return (
      <DashboardCard className="p-6 space-y-3" data-testid="whatsapp-embedded-signup-panel-disabled">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">
            {t("notifications.whatsapp.settings.embeddedSignup.title")}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("notifications.whatsapp.settings.embeddedSignup.flagOff")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("notifications.whatsapp.settings.embeddedSignup.manualStillAvailable")}
        </p>
      </DashboardCard>
    );
  }

  const busy = busyMode !== null;
  const statusLabel = statusRow?.status ? String(statusRow.status) : null;
  const connectedPhone = statusRow?.phone_number_id ? String(statusRow.phone_number_id) : null;
  const connectedWaba = statusRow?.business_account_id
    ? String(statusRow.business_account_id)
    : null;

  return (
    <DashboardCard className="p-6 space-y-5" data-testid="whatsapp-embedded-signup-panel">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">
            {t("notifications.whatsapp.settings.embeddedSignup.title")}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("notifications.whatsapp.settings.embeddedSignup.description")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div
          className="rounded-lg border border-border p-4 space-y-3"
          data-testid="whatsapp-onboarding-coexistence"
        >
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary" />
            <h4 className="font-medium">
              {t("notifications.whatsapp.settings.embeddedSignup.optionATitle")}
            </h4>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("notifications.whatsapp.settings.embeddedSignup.optionADescription")}
          </p>
          <ul className="text-xs text-muted-foreground list-disc ps-4 space-y-1">
            <li>{t("notifications.whatsapp.settings.embeddedSignup.optionAPoint1")}</li>
            <li>{t("notifications.whatsapp.settings.embeddedSignup.optionAPoint2")}</li>
            <li>{t("notifications.whatsapp.settings.embeddedSignup.optionAPoint3")}</li>
          </ul>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !coexistenceUi}
            onClick={() => void onConnect("coexistence")}
          >
            {busyMode === "coexistence" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("notifications.whatsapp.settings.embeddedSignup.optionACta")}
          </Button>
          {!coexistenceUi ? (
            <p className="text-xs text-muted-foreground">
              {t("notifications.whatsapp.settings.embeddedSignup.coexistenceDisabledHint")}
            </p>
          ) : null}
        </div>

        <div
          className="rounded-lg border border-border p-4 space-y-3"
          data-testid="whatsapp-onboarding-cloud-api"
        >
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            <h4 className="font-medium">
              {t("notifications.whatsapp.settings.embeddedSignup.optionBTitle")}
            </h4>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("notifications.whatsapp.settings.embeddedSignup.optionBDescription")}
          </p>
          <ul className="text-xs text-muted-foreground list-disc ps-4 space-y-1">
            <li>{t("notifications.whatsapp.settings.embeddedSignup.optionBPoint1")}</li>
            <li>{t("notifications.whatsapp.settings.embeddedSignup.optionBPoint2")}</li>
            <li>{t("notifications.whatsapp.settings.embeddedSignup.optionBPoint3")}</li>
          </ul>
          <Button type="button" disabled={busy} onClick={() => void onConnect("cloud_api_new")}>
            {busyMode === "cloud_api_new" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("notifications.whatsapp.settings.embeddedSignup.optionBCta")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg bg-muted/40 p-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">
            {t("notifications.whatsapp.settings.embeddedSignup.statusTitle")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={statusLoading}
            onClick={() => void refreshStatus()}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {statusLabel ? (
          <p className="text-muted-foreground">
            {t("notifications.whatsapp.settings.embeddedSignup.statusLabel")}: {statusLabel}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {t("notifications.whatsapp.settings.embeddedSignup.statusEmpty")}
          </p>
        )}
        {connectedPhone ? (
          <p className="text-xs text-muted-foreground">
            phone_number_id: {connectedPhone}
            {connectedWaba ? ` · WABA: ${connectedWaba}` : ""}
          </p>
        ) : null}
        {hasExistingConnection && onDisconnect ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || disconnecting}
            data-testid="whatsapp-onboarding-disconnect"
            onClick={() => {
              if (!window.confirm(t("notifications.whatsapp.settings.embeddedSignup.disconnectConfirm"))) {
                return;
              }
              setDisconnecting(true);
              void Promise.resolve(onDisconnect())
                .then(() => {
                  toast({
                    title: t("notifications.whatsapp.settings.embeddedSignup.disconnectSuccess"),
                  });
                  return refreshStatus();
                })
                .catch((error) => {
                  toast({
                    title: t("notifications.whatsapp.settings.embeddedSignup.disconnectFailed"),
                    description: error instanceof Error ? error.message : String(error),
                    variant: "destructive",
                  });
                })
                .finally(() => setDisconnecting(false));
            }}
          >
            {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {t("notifications.whatsapp.settings.embeddedSignup.disconnect")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("notifications.whatsapp.settings.embeddedSignup.manualStillAvailable")}
        </p>
      </div>
    </DashboardCard>
  );
}
