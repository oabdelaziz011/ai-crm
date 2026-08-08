import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  mapMetaDeliveryStatus,
} from "../meta/meta-graph-webhook.js";
import type {
  ParsedWhatsAppWebhookEvent,
  WhatsAppSendMessagePayload,
  WhatsAppSendMessageResponse,
  WhatsAppWebhookPayload,
} from "./whatsapp-types.js";
import type { WhatsAppChannelConfiguration } from "./whatsapp-config.js";
import { whatsAppMessagesUrl } from "./whatsapp-config.js";
import { ValidationError } from "../../errors.js";
import {
  traceOutboundValidationEnter,
  traceOutboundValidationFail,
  traceOutboundValidationPass,
} from "../../debug/omni-outbound-400-bridge.js";
import {
  recordMetaGraphOutboundFailure,
  traceMetaGraphOutboundStage,
} from "../../debug/meta-graph-outbound-audit.js";
import { waPerfMeasure } from "../../debug/whatsapp-pipeline-perf.js";
import { waTraceAddMetaTime } from "../../debug/whatsapp-conversation-trace-bridge.js";

export type WhatsAppApiClientOptions = {
  fetchFn?: typeof fetch;
  onOutboundRequest?: (detail: WhatsAppOutboundRequestDiagnostic) => void;
};

export type WhatsAppOutboundRequestDiagnostic = {
  endpoint: string;
  graphApiVersion: string;
  phoneNumberId: string;
  businessAccountId?: string;
  accessTokenSource: string;
  recipientType?: string;
  messageType?: string;
  httpStatus?: number;
  metaErrorCode?: number;
  metaErrorMessage?: string;
};

export class WhatsAppApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: WhatsAppApiClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendMessage(
    config: WhatsAppChannelConfiguration,
    payload: WhatsAppSendMessagePayload,
    options?: {
      accessTokenSource?: string;
      companyId?: string | null;
      companyChannelId?: string | null;
    },
  ): Promise<WhatsAppSendMessageResponse> {
    const endpoint = whatsAppMessagesUrl(config);
    const graphApiVersion = config.apiVersion ?? "v21.0";
    const accessTokenPresent = Boolean(config.accessToken?.trim());

    traceMetaGraphOutboundStage({
      stage: "WhatsAppApiClient.sendMessage.enter",
      layer: "whatsapp.provider",
      file: "whatsapp-api-client.ts",
      function: "sendMessage",
      line: 52,
      extra: {
        endpoint,
        phoneNumberId: config.phoneNumberId,
        graphApiVersion,
        accessTokenPresent,
        companyId: options?.companyId ?? null,
        companyChannelId: options?.companyChannelId ?? null,
        recipient: payload.to,
        messageType: payload.type,
      },
    });

    traceOutboundValidationEnter({
      validationName: "WhatsAppApiClient.sendMessage",
      layer: "whatsapp.provider",
      file: "whatsapp-api-client.ts",
      function: "sendMessage",
      line: 46,
      requestPayload: {
        endpoint,
        phoneNumberId: config.phoneNumberId,
        recipient: payload.to,
        messageType: payload.type,
      },
    });

    const requestBodyJson = JSON.stringify(payload);
    console.log("[WHATSAPP_OUTBOUND_TRACE] before Meta POST", {
      companyId: options?.companyId ?? null,
      companyChannelId: options?.companyChannelId ?? null,
      method: "POST",
      path: `/${config.phoneNumberId}/messages`,
      endpoint,
      graphApiVersion,
      phoneNumberId: config.phoneNumberId,
      recipient: payload.to,
      messageType: payload.type,
      accessTokenPresent,
      requestBody: payload,
    });

    const metaStartedAt = Date.now();
    const { response, body } = await waPerfMeasure(
      "Meta send API",
      async () => {
        const response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: requestBodyJson,
        });

        const body = (await response.json()) as WhatsAppSendMessageResponse & {
          error?: {
            message?: string;
            error_user_msg?: string;
            code?: number;
            type?: string;
            error_subcode?: number;
            fbtrace_id?: string;
            [key: string]: unknown;
          };
        };
        return { response, body };
      },
      {
        phoneNumberId: config.phoneNumberId,
        recipient: payload.to,
        messageType: payload.type,
      },
    );
    waTraceAddMetaTime(Date.now() - metaStartedAt);

    this.options.onOutboundRequest?.({
      endpoint,
      graphApiVersion,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      accessTokenSource: options?.accessTokenSource ?? "company_channels.configuration",
      recipientType: payload.recipient_type,
      messageType: payload.type,
      httpStatus: response.status,
      metaErrorCode: body.error?.code,
      metaErrorMessage: body.error?.error_user_msg ?? body.error?.message,
    });

    console.log("[WHATSAPP_OUTBOUND_TRACE] Meta HTTP response", {
      companyId: options?.companyId ?? null,
      companyChannelId: options?.companyChannelId ?? null,
      path: `/${config.phoneNumberId}/messages`,
      endpoint,
      phoneNumberId: config.phoneNumberId,
      recipient: payload.to,
      httpStatus: response.status,
      ok: response.ok,
      responseBody: body,
      externalMessageId: body.messages?.[0]?.id ?? null,
      metaErrorCode: body.error?.code ?? null,
      metaErrorMessage: body.error?.error_user_msg ?? body.error?.message ?? null,
    });

    console.log("[WHATSAPP] Meta response", {
      companyId: options?.companyId ?? null,
      companyChannelId: options?.companyChannelId ?? null,
      phoneNumberId: config.phoneNumberId,
      recipient: payload.to,
      httpStatus: response.status,
      ok: response.ok,
      externalMessageId: body.messages?.[0]?.id ?? null,
      metaErrorCode: body.error?.code ?? null,
      metaErrorMessage: body.error?.error_user_msg ?? body.error?.message ?? null,
    });

    if (!response.ok) {
      const errorMessage =
        body.error?.error_user_msg ?? body.error?.message ?? `WhatsApp API error (${response.status})`;
      console.error("[ERROR] WhatsApp Meta API send failed", {
        companyId: options?.companyId ?? null,
        companyChannelId: options?.companyChannelId ?? null,
        phoneNumberId: config.phoneNumberId,
        recipient: payload.to,
        httpStatus: response.status,
        metaErrorCode: body.error?.code ?? null,
        metaErrorSubcode: body.error?.error_subcode ?? null,
        metaErrorType: body.error?.type ?? null,
        metaFbTraceId: body.error?.fbtrace_id ?? null,
        metaErrorMessage: errorMessage,
        responseBody: body,
      });

      recordMetaGraphOutboundFailure({
        file: "whatsapp-api-client.ts",
        function: "sendMessage",
        line: 108,
        httpStatus: response.status,
        httpResponseBody: body,
        endpoint,
        phoneNumberId: config.phoneNumberId,
        graphApiVersion,
        accessTokenPresent,
        companyChannelId: options?.companyChannelId ?? null,
        companyId: options?.companyId ?? null,
        mappedValidationMessage: errorMessage,
      });

      traceOutboundValidationFail({
        validationName: "WhatsAppApiClient.sendMessage.responseOk",
        layer: "whatsapp.provider",
        file: "whatsapp-api-client.ts",
        function: "sendMessage",
        line: 108,
        error: errorMessage,
        responseBody: body,
        rootCause: `Meta Graph API raw response HTTP ${response.status}`,
      });
      throw new ValidationError(errorMessage, {
        metaErrorCode: body.error?.code,
        metaErrorSubcode: body.error?.error_subcode,
      });
    }

    traceOutboundValidationPass("WhatsAppApiClient.sendMessage.responseOk", {
      httpStatus: response.status,
    });
    traceOutboundValidationPass("WhatsAppApiClient.sendMessage");

    return body;
  }

  async getMediaUrl(config: WhatsAppChannelConfiguration, mediaId: string): Promise<string> {
    const apiVersion = config.apiVersion ?? "v21.0";
    const metaResponse = await this.fetchFn(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const meta = (await metaResponse.json()) as { url?: string; error?: { message?: string } };
    if (!metaResponse.ok || !meta.url) {
      throw new ValidationError(meta.error?.message ?? "Failed to resolve WhatsApp media URL.");
    }
    return meta.url;
  }
}

export function verifyWhatsAppWebhookChallenge(input: {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
  expectedVerifyToken: string;
}): string | null {
  return verifyMetaWebhookChallenge(input);
}

export async function verifyWhatsAppWebhookSignature(input: {
  signatureHeader?: string | null;
  rawBody: string;
  appSecret?: string | null;
  requireSecret?: boolean;
}): Promise<boolean> {
  return verifyMetaWebhookSignature(input);
}

export function parseWhatsAppWebhookEvents(rawPayload: Record<string, unknown>): ParsedWhatsAppWebhookEvent[] {
  const payload = rawPayload as WhatsAppWebhookPayload;
  if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return [];
  }

  const events: ParsedWhatsAppWebhookEvent[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;

      for (const message of value.messages ?? []) {
        events.push({
          kind: "message",
          idempotencyKey: message.id,
          externalThreadId: message.from,
          externalMessageId: message.id,
          senderExternalId: message.from,
          senderName: value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name,
          phoneNumberId,
          message,
          raw: rawPayload,
        });
      }

      for (const status of value.statuses ?? []) {
        events.push({
          kind: "status",
          idempotencyKey: `${status.id}:${status.status}:${status.timestamp}`,
          externalMessageId: status.id,
          externalThreadId: status.recipient_id,
          status: status.status,
          providerResponse: { status },
          errorMessage: status.errors?.[0]?.message ?? status.errors?.[0]?.title,
          raw: rawPayload,
        });
      }
    }
  }

  return events;
}

export function mapWhatsAppDeliveryStatus(
  status: "sent" | "delivered" | "read" | "failed",
): "sent" | "delivered" | "read" | "failed" {
  return mapMetaDeliveryStatus(status);
}
