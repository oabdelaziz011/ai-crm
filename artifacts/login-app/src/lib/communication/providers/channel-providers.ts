import type { SupabaseClient } from "@supabase/supabase-js";
import { getNotificationServices } from "@/lib/notifications";
import type { NotificationChannel, NotificationEvent } from "@/lib/notifications/types";
import type { CommunicationProvider, ProviderSendContext, ProviderSendOutcome } from "@/lib/communication/providers/communication-provider";
import { safeCommunicationLog } from "@/lib/communication/utilities";

const CHANNEL_MAP: Record<string, NotificationChannel> = {
  whatsapp: "whatsapp",
  email: "email",
  sms: "sms",
  push: "push",
};

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Delegates to NotificationService — no duplicate transport logic. */
export class NotificationChannelCommunicationProvider implements CommunicationProvider {
  constructor(
    readonly channel: "whatsapp" | "email" | "sms" | "push",
    readonly providerName: string,
  ) {}

  async send(context: ProviderSendContext): Promise<ProviderSendOutcome> {
    const notificationChannel = CHANNEL_MAP[this.channel];
    if (!notificationChannel) {
      return { status: "failed", error: `Unsupported channel: ${this.channel}` };
    }

    try {
      const services = getNotificationServices();
      const bookingId = metadataString(context.metadata, "bookingId");
      const businessExceptionItemId = metadataString(context.metadata, "businessExceptionItemId");
      // D5.1 — when recipient.phone is already E.164, also set phoneE164 so the
      // worker prefers canonical identity over any legacy params.phone override.
      const recipientPhone = context.recipient.phone ?? "";
      const params = {
        ...context.renderedVariables,
        companyId: context.companyId,
        customerId: context.recipient.customerId ?? "",
        email: context.recipient.email ?? "",
        phone: recipientPhone,
        ...(recipientPhone.startsWith("+") ? { phoneE164: recipientPhone } : {}),
        customerName: context.recipient.name ?? "",
        customerEmail: context.recipient.email ?? "",
        customerPhone: recipientPhone,
        ...(bookingId ? { bookingId } : {}),
        ...(businessExceptionItemId ? { businessExceptionItemId } : {}),
      };

      const deliveries = await services.notifications.createNotificationDeliveries({
        companyId: context.companyId,
        event: context.notificationEvent as NotificationEvent,
        channels: [notificationChannel],
        recipients: [{ userId: context.recipient.userId ?? null, companyId: context.companyId }],
        params,
        priority: "normal",
      });

      const delivery = deliveries[0];
      if (!delivery) {
        return {
          status: "failed",
          error: "notification_not_created",
        };
      }

      return {
        status: "queued",
        notificationId: delivery.notification.id,
        queueId: delivery.queueId,
        providerMessageId: null,
      };
    } catch (error) {
      safeCommunicationLog("error", `${this.channel} send failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function createDefaultCommunicationProviders(): CommunicationProvider[] {
  return [
    new NotificationChannelCommunicationProvider("whatsapp", "meta_whatsapp"),
    new NotificationChannelCommunicationProvider("email", "smtp_email"),
    new NotificationChannelCommunicationProvider("sms", "sms_stub"),
    new NotificationChannelCommunicationProvider("push", "push_stub"),
  ];
}

/** Process outbound queue via existing notification providers. */
export async function processCommunicationQueue(
  client: SupabaseClient,
  companyId: string,
  channel: "whatsapp" | "email",
  limit = 25,
): Promise<{ processed: number; failed: number }> {
  if (channel === "whatsapp") {
    const { isWhatsAppApiConfigured, processWhatsAppQueue } = await import(
      "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client"
    );
    if (isWhatsAppApiConfigured()) {
      const result = (await processWhatsAppQueue(companyId)) as {
        processed?: number;
        failed?: number;
      };
      return {
        processed: Number(result.processed ?? 0),
        failed: Number(result.failed ?? 0),
      };
    }

    const { MetaWhatsAppTransport } = await import(
      "@/lib/notifications/providers/whatsapp/adapter/meta-whatsapp-transport"
    );
    const { createWhatsAppProvider } = await import(
      "@/lib/notifications/providers/whatsapp/services/whatsapp-provider"
    );
    const { createLoginAppWhatsAppMessagesCommercialPort } = await import(
      "@/lib/notifications/providers/whatsapp/services/whatsapp-messages-commercial-port"
    );
    const { WhatsAppRenderer } = await import(
      "@/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer"
    );
    const provider = createWhatsAppProvider(
      client,
      new MetaWhatsAppTransport(),
      new WhatsAppRenderer((k, p) => `${k} ${Object.values(p).join(" ")}`),
      {
        whatsappMessagesCommercial: createLoginAppWhatsAppMessagesCommercialPort(client),
      },
    );
    const result = await provider.processPending(companyId, limit);
    return { processed: result.processed, failed: result.failed };
  }

  if (channel === "email") {
    const { isEmailApiConfigured, processEmailQueue } = await import(
      "@/lib/notifications/providers/email/services/email-api-client"
    );
    if (isEmailApiConfigured()) {
      const result = (await processEmailQueue(companyId)) as {
        processed?: number;
        failed?: number;
      };
      return {
        processed: Number(result.processed ?? 0),
        failed: Number(result.failed ?? 0),
      };
    }

    const { ensureEmailProviderServices } = await import("@/lib/notifications/providers/email");
    const { provider } = await ensureEmailProviderServices();
    const result = await provider.processPending(companyId, limit);
    return { processed: result.processed, failed: result.failed };
  }

  return { processed: 0, failed: 0 };
}
