/**
 * Connect Email provider chooser — Gmail / Microsoft 365 / Generic IMAP+SMTP.
 * Does not invent a second channel system; applies presets into company_email_settings.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, Mail, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";
import type { EmailMailboxProvider, EmailSettingsDraft } from "@/lib/notifications/providers/email/types/email-types";
import { EMAIL_MAILBOX_PROVIDER_PRESETS } from "@/lib/email-workspace/email-mailbox-provider-presets";

type Props = {
  companyId: string;
  draft: EmailSettingsDraft;
  onApplyDraft: (next: EmailSettingsDraft) => void;
  onSettingsChanged?: () => void;
};

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return headers;
}

export function EmailConnectProviderPanel({ companyId, draft, onApplyDraft, onSettingsChanged }: Props) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const [busy, setBusy] = useState<EmailMailboxProvider | null>(null);
  const [microsoftConfigured, setMicrosoftConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("microsoft_oauth");
    if (!oauth) return;
    if (oauth === "connected") {
      toast({ title: t("emailModule.connect.microsoftConnected") });
      onSettingsChanged?.();
    } else {
      toast({
        title: t("emailModule.connect.microsoftFailed"),
        description: params.get("reason") ?? undefined,
        variant: "destructive",
      });
    }
    params.delete("microsoft_oauth");
    params.delete("reason");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [onSettingsChanged, t, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = resolveAuthenticatedApiBase();
      if (!base) return;
      try {
        const response = await fetch(`${base}/email/providers`, {
          method: "POST",
          headers: await authHeaders(),
          credentials: "include",
          body: JSON.stringify({ companyId }),
        });
        if (!response.ok) return;
        const json = (await response.json()) as { microsoftOAuthConfigured?: boolean };
        if (!cancelled) setMicrosoftConfigured(Boolean(json.microsoftOAuthConfigured));
      } catch {
        if (!cancelled) setMicrosoftConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const applyLocalPreset = (provider: EmailMailboxProvider) => {
    const preset = EMAIL_MAILBOX_PROVIDER_PRESETS[provider];
    onApplyDraft({
      ...draft,
      mailboxProvider: provider,
      inboundProvider: preset.inboundProvider,
      outboundProvider: preset.outboundProvider,
      smtpHost: preset.smtpHost || draft.smtpHost,
      smtpPort: preset.smtpPort,
      smtpEncryption: preset.smtpEncryption,
      imapHost: preset.imapHost || draft.imapHost,
      imapPort: preset.imapPort,
      imapEncryption: preset.imapEncryption,
      oauthProvider: provider === "microsoft_365" ? "microsoft" : draft.oauthProvider,
    });
  };

  const onSelect = async (provider: EmailMailboxProvider) => {
    setBusy(provider);
    try {
      applyLocalPreset(provider);
      const base = resolveAuthenticatedApiBase();
      if (base) {
        await fetch(`${base}/email/providers/apply-preset`, {
          method: "POST",
          headers: await authHeaders(),
          credentials: "include",
          body: JSON.stringify({ companyId, mailboxProvider: provider }),
        });
      }

      if (provider === "microsoft_365") {
        if (microsoftConfigured === false) {
          toast({
            title: t("emailModule.connect.microsoftNotConfigured"),
            variant: "destructive",
          });
          return;
        }
        if (!base) throw new Error("API not configured");
        const start = await fetch(`${base}/email/microsoft/oauth/start`, {
          method: "POST",
          headers: await authHeaders(),
          credentials: "include",
          body: JSON.stringify({ companyId }),
        });
        const payload = (await start.json()) as {
          authorizeUrl?: string;
          error?: string;
          message?: { en?: string; ar?: string };
        };
        if (!start.ok || !payload.authorizeUrl) {
          const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
          throw new Error(payload.message?.[locale] ?? payload.error ?? "OAuth start failed");
        }
        window.location.assign(payload.authorizeUrl);
        return;
      }

      toast({ title: t("emailModule.connect.presetApplied") });
      onSettingsChanged?.();
    } catch (error) {
      toast({
        title: t("emailModule.connect.applyFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const statusLabel = draft.connectionStatus
    ? t(`emailModule.connect.status.${draft.connectionStatus}`, {
        defaultValue: draft.connectionStatus,
      })
    : null;

  return (
    <DashboardCard className="p-6 space-y-4" data-testid="email-connect-provider">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">{t("emailModule.connect.title")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{t("emailModule.connect.subtitle")}</p>

      {(draft.mailboxProvider || draft.fromEmail) && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm" data-testid="email-connection-status">
          <div>
            {t("emailModule.connect.currentProvider")}:{" "}
            <span className="font-medium">
              {t(`emailModule.connect.providers.${draft.mailboxProvider ?? "imap_smtp"}`)}
            </span>
          </div>
          {draft.fromEmail ? (
            <div dir="ltr" className="text-muted-foreground">
              {draft.fromEmail}
            </div>
          ) : null}
          {statusLabel ? <div className="text-muted-foreground">{statusLabel}</div> : null}
          {draft.connectionLastError ? (
            <div className="text-destructive text-xs mt-1">{draft.connectionLastError}</div>
          ) : null}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { id: "gmail" as const, icon: Mail },
            { id: "microsoft_365" as const, icon: Mail },
            { id: "imap_smtp" as const, icon: Server },
          ] as const
        ).map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-testid={`email-connect-${id}`}
            disabled={busy !== null}
            onClick={() => void onSelect(id)}
            className="flex flex-col items-start gap-2 rounded-md border border-border bg-background p-4 text-start hover:bg-muted/40 disabled:opacity-60"
          >
            <Icon className="size-4 text-primary" />
            <span className="text-sm font-medium">{t(`emailModule.connect.providers.${id}`)}</span>
            <span className="text-xs text-muted-foreground">{t(`emailModule.connect.providerHints.${id}`)}</span>
            {busy === id ? <Loader2 className="size-4 animate-spin" /> : null}
          </button>
        ))}
      </div>

      {draft.mailboxProvider === "microsoft_365" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void onSelect("microsoft_365")}
          data-testid="email-connect-microsoft-button"
        >
          {t("emailModule.connect.connectMicrosoft")}
        </Button>
      ) : null}
    </DashboardCard>
  );
}
