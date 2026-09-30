import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationQueueItem } from "@/lib/notifications/types";
import { requireCompanyFeature } from "@/lib/billing/require-company-feature";
import { reconcileCampaignRecipientSendSuccess } from "@/lib/campaigns/reconcile-campaign-recipient-delivery";
import { InfobipSmsTransport } from "@/lib/notifications/providers/sms/adapter/infobip-sms-transport";
import {
  TwilioSmsTransport,
} from "@/lib/notifications/providers/sms/adapter/twilio-sms-transport";
import type {
  SmsVendorKind,
  SmsVendorRuntimeConfig,
  SmsVendorTransport,
} from "@/lib/notifications/providers/sms/adapter/sms-vendor-transport";
import { SmsQueueConsumer } from "@/lib/notifications/providers/sms/services/sms-queue-consumer";
import {
  DEFAULT_SMS_MAX_RETRY,
  SmsRetryPolicy,
} from "@/lib/notifications/providers/sms/services/sms-retry-policy";

export type CompanySmsRuntimeSettings = {
  enabled: boolean;
  provider: string;
  accountSid: string;
  fromNumber: string;
  authToken: string;
  apiKey: string;
  baseUrl: string;
};

export type SmsDeliveryResult = {
  queueId: string;
  notificationId: string | null;
  companyId: string;
  provider: SmsVendorKind | string;
  status: "completed" | "failed";
  durationMs: number;
  attempts: number;
  lastError: string | null;
  recipientPhone: string | null;
  messageId: string | null;
  timestamp: string;
};

export type SmsProviderProcessResult = {
  processed: number;
  completed: number;
  failed: number;
  results: SmsDeliveryResult[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readParam(params: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Prefer campaign detail body; otherwise title+detail; never invent content. */
export function buildSmsOutboundBody(params: Record<string, unknown>): string {
  const detail = readParam(params, "detail");
  if (detail) return detail;
  const title = readParam(params, "campaignTitle", "title");
  const message = readParam(params, "message", "body", "text");
  return [title, message].filter(Boolean).join("\n").trim();
}

export function resolveSmsOutboundPhone(params: Record<string, unknown>): string {
  return readParam(params, "phoneE164", "phone", "customerPhone", "to");
}

async function loadSmsRuntimeSettings(
  client: SupabaseClient,
  companyId: string,
): Promise<CompanySmsRuntimeSettings | null> {
  const { data, error } = await client.rpc("get_company_sms_settings_decrypted", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    provider: String(row.provider ?? "").trim() || "twilio",
    accountSid: String(row.account_sid ?? "").trim(),
    fromNumber: String(row.from_number ?? "").trim(),
    authToken: String(row.auth_token ?? "").trim(),
    apiKey: String(row.api_key ?? "").trim(),
    baseUrl: String(row.base_url ?? "").trim(),
  };
}

async function resolveSmsStatusCallbackUrl(
  client: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const base = (
    process.env.VITE_WEBHOOK_BASE_URL ||
    process.env.PUBLIC_WEBHOOK_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!base) return null;

  const { data, error } = await client
    .from("company_channels")
    .select("id, communication_channels!inner(key)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .eq("communication_channels.key", "sms")
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return `${base}/api/webhooks/sms/${String(data.id)}`;
}

function resolveVendorTransport(
  provider: string,
  transports: { twilio: SmsVendorTransport; infobip: SmsVendorTransport },
): SmsVendorTransport {
  if (provider === "infobip") return transports.infobip;
  return transports.twilio;
}

function buildVendorConfig(
  settings: CompanySmsRuntimeSettings,
  statusCallback: string | null,
): SmsVendorRuntimeConfig {
  const provider = settings.provider === "infobip" ? "infobip" : "twilio";
  return {
    provider,
    fromNumber: settings.fromNumber,
    statusCallback,
    accountSid: settings.accountSid,
    authToken: settings.authToken,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
  };
}

/** Consumes sms channel queue items via the configured SMS vendor. Service-role client required. */
export class SmsProvider {
  constructor(
    private readonly client: SupabaseClient,
    private readonly transports: {
      twilio: SmsVendorTransport;
      infobip: SmsVendorTransport;
    },
    private readonly queueConsumer: SmsQueueConsumer,
  ) {}

  async processPending(companyId: string, limit = 25): Promise<SmsProviderProcessResult> {
    const settings = await loadSmsRuntimeSettings(this.client, companyId);
    if (!settings?.enabled) {
      return { processed: 0, completed: 0, failed: 0, results: [] };
    }

    const retryPolicy = new SmsRetryPolicy(DEFAULT_SMS_MAX_RETRY);
    const pending = await this.queueConsumer.listPendingSms(companyId, limit);
    const statusCallback = await resolveSmsStatusCallbackUrl(this.client, companyId);
    const results: SmsDeliveryResult[] = [];
    let completed = 0;
    let failed = 0;

    for (const item of pending) {
      const result = await this.processQueueItem(item, settings, retryPolicy, statusCallback);
      results.push(result);
      if (result.status === "completed") completed += 1;
      else failed += 1;
    }

    return {
      processed: pending.length,
      completed,
      failed,
      results,
    };
  }

  private async processQueueItem(
    item: NotificationQueueItem,
    settings: CompanySmsRuntimeSettings,
    retryPolicy: SmsRetryPolicy,
    statusCallback: string | null,
  ): Promise<SmsDeliveryResult> {
    const started = Date.now();
    const attempts = item.retryCount + 1;
    const payload = asRecord(item.payload);
    const params = asRecord(payload.params);
    const providerLabel = settings.provider === "infobip" ? "infobip" : "twilio";

    await this.queueConsumer.markProcessing(item.companyId, item.id);

    try {
      await requireCompanyFeature(this.client, item.companyId, "sms_channel");
      this.assertCredentialsSendable(settings);

      const phone = resolveSmsOutboundPhone(params);
      if (!phone) {
        throw new Error("Recipient phone unavailable for SMS.");
      }

      const body = buildSmsOutboundBody(params);
      if (!body) {
        throw new Error("SMS body is empty.");
      }

      const transport = resolveVendorTransport(settings.provider, this.transports);
      const sendResult = await transport.send(
        { to: phone, body },
        buildVendorConfig(settings, statusCallback),
      );
      await this.queueConsumer.markCompleted(item.companyId, item.id);

      await reconcileCampaignRecipientSendSuccess(this.client, {
        companyId: item.companyId,
        queueId: item.id,
        providerMessageId: sendResult.messageId,
      }).catch(() => undefined);

      return {
        queueId: item.id,
        notificationId: item.notificationId,
        companyId: item.companyId,
        provider: providerLabel,
        status: "completed",
        durationMs: Date.now() - started,
        attempts,
        lastError: null,
        recipientPhone: phone,
        messageId: sendResult.messageId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const decision = retryPolicy.evaluate(item.retryCount);
      const rescheduleAt = decision.shouldRetry
        ? new Date(Date.now() + decision.delayMs).toISOString()
        : undefined;

      await this.queueConsumer.markFailed(
        item.companyId,
        item.id,
        message,
        decision.nextAttempt,
        rescheduleAt,
      );

      return {
        queueId: item.id,
        notificationId: item.notificationId,
        companyId: item.companyId,
        provider: providerLabel,
        status: "failed",
        durationMs: Date.now() - started,
        attempts,
        lastError: message,
        recipientPhone: resolveSmsOutboundPhone(params) || null,
        messageId: null,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private assertCredentialsSendable(settings: CompanySmsRuntimeSettings): void {
    if (settings.provider === "infobip") {
      if (!settings.apiKey || !settings.fromNumber) {
        throw new Error("Infobip SMS credentials are incomplete. Update company SMS settings.");
      }
      return;
    }
    if (settings.provider !== "twilio") {
      throw new Error(`SMS provider "${settings.provider}" is not supported.`);
    }
    if (!settings.accountSid || !settings.authToken || !settings.fromNumber) {
      throw new Error("SMS credentials are incomplete. Update company SMS settings.");
    }
  }
}

export function createSmsProvider(
  client: SupabaseClient,
  transports?: {
    twilio?: SmsVendorTransport;
    infobip?: SmsVendorTransport;
  },
): SmsProvider {
  return new SmsProvider(
    client,
    {
      twilio: transports?.twilio ?? new TwilioSmsTransport(),
      infobip: transports?.infobip ?? new InfobipSmsTransport(),
    },
    new SmsQueueConsumer(client),
  );
}
