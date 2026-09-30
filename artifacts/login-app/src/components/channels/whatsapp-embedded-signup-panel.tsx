import { useEffect, useRef, useState } from "react";
import { Loader2, Link2 } from "lucide-react";
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
  isWhatsAppEmbeddedSignupApiConfigured,
  type WhatsAppEmbeddedSignupSessionResponse,
} from "@/lib/channels/whatsapp-embedded-signup-client";

type FacebookSdk = {
  init: (opts: Record<string, unknown>) => void;
  login: (
    cb: (response: { authResponse?: { code?: string } | null }) => void,
    opts: Record<string, unknown>,
  ) => void;
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
  onCompleted?: () => void;
};

/**
 * Additive Connect-with-Meta shell. Renders nothing when the UI feature flag is off
 * (no SDK load). Manual WhatsApp form remains the primary path.
 */
export function WhatsAppEmbeddedSignupPanel({
  companyId,
  onCompleted,
}: WhatsAppEmbeddedSignupPanelProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<WhatsAppEmbeddedSignupSessionResponse | null>(null);
  const pendingPhoneRef = useRef<{
    phoneNumberId?: string;
    businessAccountId?: string;
    businessPortfolioId?: string;
  }>({});

  const uiEnabled = isWhatsAppEmbeddedSignupUiEnabled();
  const coexistenceUi = isWhatsAppCoexistenceUiEnabled();

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

  if (!uiEnabled) {
    return null;
  }

  const onConnect = async () => {
    if (!isWhatsAppEmbeddedSignupApiConfigured()) {
      toast({
        title: t("notifications.whatsapp.settings.embeddedSignup.apiMissing"),
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    pendingPhoneRef.current = {};
    try {
      const session = await createWhatsAppEmbeddedSignupSession(companyId);
      sessionRef.current = session;
      const fb = await loadFacebookSdk(session.appId, session.graphApiVersion);

      const extras: Record<string, unknown> = {
        setup: {},
        sessionInfoVersion: "3",
      };
      if (session.featureType || coexistenceUi) {
        extras.featureType = session.featureType ?? "whatsapp_business_app_onboarding";
      }

      fb.login(
        async (response) => {
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
            if (!phoneNumberId || !businessAccountId) {
              toast({
                title: t("notifications.whatsapp.settings.embeddedSignup.missingSessionInfo"),
                variant: "destructive",
              });
              return;
            }

            await completeWhatsAppEmbeddedSignup({
              companyId,
              code,
              state: session.state,
              phoneNumberId,
              businessAccountId,
              businessPortfolioId: pendingPhoneRef.current.businessPortfolioId ?? null,
              replaceExisting: false,
              coexistenceEligible: Boolean(session.featureType),
            });

            toast({ title: t("notifications.whatsapp.settings.embeddedSignup.success") });
            onCompleted?.();
          } catch (error) {
            const code = (error as Error & { code?: string }).code;
            const message = error instanceof Error ? error.message : String(error);
            toast({
              title:
                code === "ES_CONNECTION_EXISTS"
                  ? t("notifications.whatsapp.settings.embeddedSignup.existingConnection")
                  : t("notifications.whatsapp.settings.embeddedSignup.failed"),
              description: message,
              variant: "destructive",
            });
          } finally {
            setBusy(false);
          }
        },
        {
          config_id: session.configId,
          response_type: "code",
          override_default_response_type: true,
          extras,
        },
      );
    } catch (error) {
      setBusy(false);
      toast({
        title: t("notifications.whatsapp.settings.embeddedSignup.failed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardCard className="p-6 space-y-3" data-testid="whatsapp-embedded-signup-panel">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">
          {t("notifications.whatsapp.settings.embeddedSignup.title")}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("notifications.whatsapp.settings.embeddedSignup.description")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("notifications.whatsapp.settings.embeddedSignup.manualStillAvailable")}
      </p>
      <Button type="button" onClick={() => void onConnect()} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {t("notifications.whatsapp.settings.embeddedSignup.connect")}
      </Button>
    </DashboardCard>
  );
}
