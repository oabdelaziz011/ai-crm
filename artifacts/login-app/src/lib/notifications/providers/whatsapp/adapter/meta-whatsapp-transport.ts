import type {
  MetaWhatsAppConfig,
  WhatsAppOutboundMessage,
  WhatsAppProviderKind,
  WhatsAppTransport,
  WhatsAppTransportHealthResult,
  WhatsAppTransportSendResult,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

const DEFAULT_API_VERSION = "v21.0";

function graphBaseUrl(apiVersion = DEFAULT_API_VERSION): string {
  return `https://graph.facebook.com/${apiVersion}`;
}

function messagesUrl(config: MetaWhatsAppConfig): string {
  return `${graphBaseUrl(config.apiVersion)}/${config.phoneNumberId}/messages`;
}

/** Meta WhatsApp Cloud API transport. */
export class MetaWhatsAppTransport implements WhatsAppTransport {
  readonly provider: WhatsAppProviderKind = "meta_cloud";

  constructor(private readonly fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  async send(
    message: WhatsAppOutboundMessage,
    config: MetaWhatsAppConfig,
  ): Promise<WhatsAppTransportSendResult> {
    const payload = this.buildPayload(message);
    const response = await this.fetchFn(messagesUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; error_user_msg?: string };
    };

    if (!response.ok) {
      throw new Error(
        body.error?.error_user_msg ?? body.error?.message ?? `WhatsApp API error (${response.status})`,
      );
    }

    return {
      messageId: body.messages?.[0]?.id ?? null,
      provider: this.provider,
    };
  }

  async healthCheck(config: MetaWhatsAppConfig): Promise<WhatsAppTransportHealthResult> {
    const started = Date.now();
    try {
      const response = await this.fetchFn(
        `${graphBaseUrl(config.apiVersion)}/${config.phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${config.accessToken}` },
        },
      );
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? `WhatsApp health check failed (${response.status})`);
      }
      return {
        ok: true,
        provider: this.provider,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.provider,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildPayload(message: WhatsAppOutboundMessage): Record<string, unknown> {
    if (message.templateId) {
      return {
        messaging_product: "whatsapp",
        to: message.to,
        type: "template",
        template: {
          name: message.templateId,
          language: { code: message.languageCode },
          components: message.bodyParameters.length
            ? [
                {
                  type: "body",
                  parameters: message.bodyParameters.map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ]
            : undefined,
        },
      };
    }

    return {
      messaging_product: "whatsapp",
      to: message.to,
      type: "text",
      text: { body: message.fallbackText },
    };
  }
}
