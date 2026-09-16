import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCompanyFeature } from "@/lib/billing/company-feature-entitlement-service";
import { EmailSettingsRepository } from "@/lib/notifications/providers/email/services/email-settings-repository";
import type { CampaignFeatureEntitlementPort } from "./meta-messaging-capability";

export const EMAIL_CAMPAIGN_FEATURE_CODE = "email_channel" as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailCampaignCapabilityResult = {
  available: boolean;
  reason:
    | "ok"
    | "not_entitled"
    | "channel_disabled_or_missing"
    | "settings_disabled"
    | "credentials_incomplete";
  companyChannelId: string | null;
  featureCode: typeof EMAIL_CAMPAIGN_FEATURE_CODE;
};

type CompanyChannelRow = {
  id: string;
  is_enabled: boolean | null;
  deleted_at: string | null;
  communication_channels?: { key?: string } | { key?: string }[] | null;
};

function channelKey(row: CompanyChannelRow): string {
  const embedded = row.communication_channels;
  if (Array.isArray(embedded)) return embedded[0]?.key ?? "";
  return embedded?.key ?? "";
}

export function hasCampaignOutboundEmail(customer: { email?: string | null }): boolean {
  return EMAIL_RE.test(String(customer.email ?? "").trim());
}

export function resolveCampaignOutboundEmail(customer: { email?: string | null }):
  | { ok: true; email: string }
  | { ok: false; reason: "missing_email" | "invalid_email" } {
  const email = String(customer.email ?? "").trim();
  if (!email) return { ok: false, reason: "missing_email" };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };
  return { ok: true, email };
}

/**
 * Resolves Email campaign availability:
 * email_channel commercial entitlement AND mailbox/SMTP config used by Email Workspace.
 */
export class EmailCampaignCapabilityChecker {
  private readonly settingsRepo: EmailSettingsRepository;

  constructor(
    private readonly client: SupabaseClient,
    private readonly entitlement: CampaignFeatureEntitlementPort = {
      isEnabled: (companyId, featureCode) => hasCompanyFeature(companyId, featureCode, client),
    },
  ) {
    this.settingsRepo = new EmailSettingsRepository(client);
  }

  async check(companyId: string): Promise<EmailCampaignCapabilityResult> {
    const featureCode = EMAIL_CAMPAIGN_FEATURE_CODE;
    const entitled = await this.entitlement.isEnabled(companyId, featureCode);
    if (!entitled) {
      return {
        available: false,
        reason: "not_entitled",
        companyChannelId: null,
        featureCode,
      };
    }

    const { data, error } = await this.client
      .from("company_channels")
      .select("id, is_enabled, deleted_at, communication_channels(key)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("is_enabled", true);

    if (error) throw new Error(error.message);

    const emailChannels = ((data as CompanyChannelRow[] | null) ?? []).filter(
      (row) => channelKey(row) === "email",
    );

    if (emailChannels.length === 0) {
      return {
        available: false,
        reason: "channel_disabled_or_missing",
        companyChannelId: null,
        featureCode,
      };
    }

    const settings = await this.settingsRepo.getPublic(companyId);
    if (!settings.enabled) {
      return {
        available: false,
        reason: "settings_disabled",
        companyChannelId: emailChannels[0]?.id ?? null,
        featureCode,
      };
    }

    const fromEmail = settings.fromEmail.trim();
    const smtpReady = Boolean(settings.smtpHost.trim()) && (settings.hasSmtpPassword || Boolean(settings.smtpUsername.trim()));
    const oauthReady = settings.hasOauthToken || settings.outboundProvider === "gmail_api" || settings.outboundProvider === "microsoft_graph";
    if (!fromEmail || (!smtpReady && !oauthReady)) {
      return {
        available: false,
        reason: "credentials_incomplete",
        companyChannelId: emailChannels[0]?.id ?? null,
        featureCode,
      };
    }

    return {
      available: true,
      reason: "ok",
      companyChannelId: emailChannels[0]?.id ?? null,
      featureCode,
    };
  }
}
