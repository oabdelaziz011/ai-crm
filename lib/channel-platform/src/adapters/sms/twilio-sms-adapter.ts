import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../../ports/channel-adapter-port.js";
import type {
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../../dto/channel-dto.js";
import { ValidationError } from "../../errors.js";
import { buildSmsExternalThreadId, parseSmsChannelReferences } from "./twilio-sms-config.js";
import { resolveSmsRuntimeConfiguration, type SmsCredentialsLoader } from "./twilio-sms-canonical-credentials.js";
import { TwilioSmsApiClient } from "./twilio-sms-api-client.js";
import { InfobipSmsApiClient, mapInfobipMessageStatus } from "./infobip-sms-api-client.js";
import {
  mapTwilioMessageStatus,
  type TwilioSmsSendPayload,
  type TwilioSmsWebhookFields,
} from "./twilio-sms-types.js";

export type TwilioSmsAdapterOptions = {
  fetchFn?: typeof fetch;
  credentialsLoader?: SmsCredentialsLoader;
  onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
  /** Optional status callback URL attached to outbound sends (public webhook base). */
  resolveStatusCallbackUrl?: (companyChannelId: string) => string | null;
};

function asFields(raw: Record<string, unknown>): TwilioSmsWebhookFields {
  return {
    MessageSid: String(raw.MessageSid ?? raw.SmsSid ?? "").trim(),
    AccountSid: typeof raw.AccountSid === "string" ? raw.AccountSid : undefined,
    From: typeof raw.From === "string" ? raw.From : undefined,
    To: typeof raw.To === "string" ? raw.To : undefined,
    Body: typeof raw.Body === "string" ? raw.Body : undefined,
    SmsStatus: typeof raw.SmsStatus === "string" ? raw.SmsStatus : undefined,
    MessageStatus: typeof raw.MessageStatus === "string" ? raw.MessageStatus : undefined,
    ErrorCode: raw.ErrorCode != null ? String(raw.ErrorCode) : undefined,
    ErrorMessage: typeof raw.ErrorMessage === "string" ? raw.ErrorMessage : undefined,
  };
}

function isStatusCallback(fields: TwilioSmsWebhookFields): boolean {
  // Status callbacks always include MessageStatus. Inbound uses SmsStatus=received + Body.
  if (fields.MessageStatus && fields.MessageStatus.toLowerCase() !== "received") {
    return true;
  }
  const smsStatus = (fields.SmsStatus ?? "").toLowerCase();
  if (smsStatus && smsStatus !== "received" && fields.Body == null) {
    return true;
  }
  return false;
}

/** Infobip delivery reports: { results: [{ messageId, to, status: { name } }] } */
function parseInfobipDeliveryReports(
  companyChannelId: string,
  channelKey: string,
  rawPayload: Record<string, unknown>,
): WebhookEnvelopeDto[] | null {
  const results = rawPayload.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  // Twilio form payloads never use `results[]` — treat as Infobip notifyUrl body.
  const envelopes: WebhookEnvelopeDto[] = [];
  for (const entry of results) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const messageId = String(row.messageId ?? "").trim();
    if (!messageId) continue;
    const statusObj =
      row.status && typeof row.status === "object" && !Array.isArray(row.status)
        ? (row.status as Record<string, unknown>)
        : {};
    const statusName = String(statusObj.name ?? statusObj.groupName ?? "").trim();
    const mapped = mapInfobipMessageStatus(statusName);
    if (!mapped) continue;
    const to = String(row.to ?? "").trim();
    const errorObj =
      row.error && typeof row.error === "object" && !Array.isArray(row.error)
        ? (row.error as Record<string, unknown>)
        : null;
    const errorMessage =
      errorObj && typeof errorObj.description === "string" ? errorObj.description : undefined;
    envelopes.push({
      eventType: "message.status",
      companyChannelId,
      channelKey,
      idempotencyKey: `sms:status:${messageId}:${mapped}`,
      externalThreadId: to ? buildSmsExternalThreadId(to.startsWith("+") ? to : `+${to}`) : "",
      externalMessageId: messageId,
      payload: {
        deliveryStatus: mapped,
        providerResponse: {
          messageId,
          status: statusName,
          provider: "infobip",
        },
        errorMessage,
        raw: rawPayload,
      },
    } satisfies WebhookEnvelopeDto);
  }
  return envelopes;
}

export class TwilioSmsAdapter implements ChannelAdapterPort {
  readonly channelKey = "sms";

  private readonly apiClient: TwilioSmsApiClient;
  private readonly infobipClient: InfobipSmsApiClient;
  private readonly credentialsLoader?: SmsCredentialsLoader;
  private readonly onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
  private readonly resolveStatusCallbackUrl?: (companyChannelId: string) => string | null;

  constructor(options: TwilioSmsAdapterOptions = {}) {
    this.credentialsLoader = options.credentialsLoader;
    this.onOutboundDiagnostic = options.onOutboundDiagnostic;
    this.resolveStatusCallbackUrl = options.resolveStatusCallbackUrl;
    this.apiClient = new TwilioSmsApiClient({
      fetchFn: options.fetchFn,
      onOutboundRequest: (detail) => this.onOutboundDiagnostic?.(detail),
    });
    this.infobipClient = new InfobipSmsApiClient({
      fetchFn: options.fetchFn,
      onOutboundRequest: (detail) => this.onOutboundDiagnostic?.(detail),
    });
  }

  parseWebhookEvents(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto[] {
    const infobipEnvelopes = parseInfobipDeliveryReports(ctx.companyChannel.id, this.channelKey, rawPayload);
    if (infobipEnvelopes) {
      return infobipEnvelopes;
    }

    const fields = asFields(rawPayload);
    if (!fields.MessageSid) {
      throw new ValidationError("SMS webhook missing provider message id.");
    }

    if (isStatusCallback(fields)) {
      const mapped = mapTwilioMessageStatus(fields.MessageStatus ?? fields.SmsStatus);
      if (!mapped) {
        return [];
      }
      const threadFrom =
        fields.To?.trim() || fields.From?.trim() || "";
      return [
        {
          eventType: "message.status",
          companyChannelId: ctx.companyChannel.id,
          channelKey: this.channelKey,
          idempotencyKey: `sms:status:${fields.MessageSid}:${mapped}`,
          externalThreadId: threadFrom ? buildSmsExternalThreadId(threadFrom) : "",
          externalMessageId: fields.MessageSid,
          payload: {
            deliveryStatus: mapped,
            providerResponse: {
              MessageSid: fields.MessageSid,
              MessageStatus: fields.MessageStatus ?? fields.SmsStatus,
              ErrorCode: fields.ErrorCode,
              ErrorMessage: fields.ErrorMessage,
            },
            errorMessage: fields.ErrorMessage,
            raw: rawPayload,
          },
        } satisfies WebhookEnvelopeDto,
      ];
    }

    const from = fields.From?.trim() ?? "";
    if (!from) {
      throw new ValidationError("Twilio SMS inbound webhook missing From.");
    }

    return [
      {
        eventType: "message.received",
        companyChannelId: ctx.companyChannel.id,
        channelKey: this.channelKey,
        idempotencyKey: `sms:inbound:${fields.MessageSid}`,
        externalThreadId: buildSmsExternalThreadId(from),
        externalMessageId: fields.MessageSid,
        payload: {
          message: {
            sid: fields.MessageSid,
            from,
            to: fields.To ?? "",
            body: fields.Body ?? "",
          },
          senderExternalId: from,
          raw: rawPayload,
        },
      } satisfies WebhookEnvelopeDto,
    ];
  }

  parseWebhook(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    const envelopes = this.parseWebhookEvents(ctx, rawPayload);
    const primary = envelopes[0];
    if (!primary) {
      throw new ValidationError("Twilio SMS webhook payload did not contain routable events.");
    }
    return primary;
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    const message = payload.message as
      | { sid?: string; from?: string; to?: string; body?: string }
      | undefined;
    if (!message?.from) {
      throw new ValidationError("Twilio SMS inbound payload missing message.from.");
    }
    const from = message.from.trim();
    return {
      externalThreadId: buildSmsExternalThreadId(from),
      externalMessageId: message.sid ?? `${from}:message`,
      senderExternalId: from,
      text: String(message.body ?? "").trim(),
      attachments: [],
      metadata: {
        smsProvider: "twilio",
        to: message.to,
      },
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    const to = message.externalThreadId.trim();
    if (!to) {
      throw new ValidationError("SMS destination phone is required.");
    }
    if (!/^\+[1-9]\d{6,14}$/.test(to)) {
      throw new ValidationError("SMS destination must be a valid E.164 phone number.");
    }
    const body = String(message.text ?? "").trim();
    if (!body) {
      throw new ValidationError("SMS body is required.");
    }
    return {
      to,
      body,
    };
  }

  async sendOutbound(
    ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    if (!this.credentialsLoader) {
      throw new ValidationError("SMS credentials loader is not configured.");
    }

    const channelReferences = parseSmsChannelReferences(ctx.companyChannel.configuration);
    const runtime = await resolveSmsRuntimeConfiguration(
      ctx.companyChannel.companyId,
      channelReferences,
      this.credentialsLoader,
    );

    this.onOutboundDiagnostic?.({
      stage: "outbound.credentials.resolved",
      companyId: ctx.companyChannel.companyId,
      companyChannelId: ctx.companyChannel.id,
      provider: runtime.provider,
      accountSid: runtime.provider === "twilio" ? runtime.accountSid : undefined,
      fromNumber: runtime.fromNumber,
      credentialSource: "company_sms_settings",
    });

    const to = String(formattedPayload.to ?? "").trim();
    const body = String(formattedPayload.body ?? "");
    const statusCallback = this.resolveStatusCallbackUrl?.(ctx.companyChannel.id) ?? undefined;

    if (runtime.provider === "infobip") {
      const response = await this.infobipClient.sendMessage(
        {
          provider: "infobip",
          apiKey: String(runtime.apiKey ?? ""),
          baseUrl: String(runtime.baseUrl ?? ""),
          fromNumber: runtime.fromNumber,
          enabled: runtime.enabled,
        },
        {
          to,
          from: runtime.fromNumber,
          body,
          notifyUrl: statusCallback || undefined,
        },
      );
      return {
        externalMessageId: response.messageId,
        providerResponse: {
          messageId: response.messageId,
          status: response.status,
          provider: "infobip",
        },
      };
    }

    const payload: TwilioSmsSendPayload = {
      To: to,
      From: runtime.fromNumber,
      Body: body,
      StatusCallback: statusCallback || undefined,
    };

    const response = await this.apiClient.sendMessage(runtime, payload);
    return {
      externalMessageId: String(response.sid),
      providerResponse: {
        sid: response.sid,
        status: response.status,
        provider: "twilio",
        // Never include auth or full credentials.
      },
    };
  }
}

export function createTwilioSmsAdapter(options?: TwilioSmsAdapterOptions): TwilioSmsAdapter {
  return new TwilioSmsAdapter(options);
}
