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
      const params = {
        ...context.renderedVariables,
        customerId: context.recipient.customerId ?? "",
        email: context.recipient.email ?? "",
        phone: context.recipient.phone ?? "",
        customerName: context.recipient.name ?? "",
        customerEmail: context.recipient.email ?? "",
        customerPhone: context.recipient.phone ?? "",
      };

      const created = await services.notifications.createNotification({
        companyId: context.companyId,
        event: context.notificationEvent as NotificationEvent,
        channels: [notificationChannel],
        recipients: [{ userId: context.recipient.userId ?? null, companyId: context.companyId }],
        params,
        priority: "normal",
      });

      const notification = created[0];
      return {
        status: "queued",
        notificationId: notification?.id,
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
    const { getWhatsAppProviderServices } = await import("@/lib/notifications/providers/whatsapp");
    const { MetaWhatsAppTransport } = await import(
      "@/lib/notifications/providers/whatsapp/adapter/meta-whatsapp-transport"
    );
    const services = getWhatsAppProviderServices();
    if (services.provider) {
      const transport = new MetaWhatsAppTransport();
      const { createWhatsAppProvider } = await import(
        "@/lib/notifications/providers/whatsapp/services/whatsapp-provider"
      );
      const { WhatsAppRenderer } = await import(
        "@/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer"
      );
      const provider = createWhatsAppProvider(
        client,
        transport,
        new WhatsAppRenderer((k, p) => `${k} ${Object.values(p).join(" ")}`),
      );
      const result = await provider.processPending(companyId, limit);
      return { processed: result.processed, failed: result.failed };
    }
  }

  if (channel === "email") {
    const { getEmailProviderServices } = await import("@/lib/notifications/providers/email");
    const result = await getEmailProviderServices().provider.processPending(companyId, limit);
    return { processed: result.processed, failed: result.failed };
  }

  return { processed: 0, failed: 0 };
}
