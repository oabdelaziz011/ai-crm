import { supabase } from "@/lib/supabase";
import { MetaWhatsAppTransport } from "@/lib/notifications/providers/whatsapp/adapter/meta-whatsapp-transport";
import { StubWhatsAppTransport } from "@/lib/notifications/providers/whatsapp/adapter/stub-whatsapp-transport";
import { WhatsAppRenderer } from "@/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer";
import { createWhatsAppProvider } from "@/lib/notifications/providers/whatsapp/services/whatsapp-provider";
import { createLoginAppWhatsAppMessagesCommercialPort } from "@/lib/notifications/providers/whatsapp/services/whatsapp-messages-commercial-port";
import { WhatsAppDeliveryLogRepository } from "@/lib/notifications/providers/whatsapp/services/whatsapp-delivery-log-repository";
import { WhatsAppSettingsRepository } from "@/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
import type { WhatsAppTransport } from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WhatsAppProviderServices = {
  provider: ReturnType<typeof createWhatsAppProvider>;
  settings: WhatsAppSettingsRepository;
  deliveryLog: WhatsAppDeliveryLogRepository;
};

const defaultRenderer = new WhatsAppRenderer((key, params) => {
  const template = key.split(".").pop() ?? key;
  return `${template} ${Object.values(params).join(" ")}`.trim();
});

export function createWhatsAppProviderServices(
  client: SupabaseClient = supabase,
  transport: WhatsAppTransport = resolveWhatsAppTransport(),
  renderer: WhatsAppRenderer = defaultRenderer,
): WhatsAppProviderServices {
  return {
    provider: createWhatsAppProvider(client, transport, renderer, {
      whatsappMessagesCommercial: createLoginAppWhatsAppMessagesCommercialPort(client),
    }),
    settings: new WhatsAppSettingsRepository(client),
    deliveryLog: new WhatsAppDeliveryLogRepository(client),
  };
}

let cached: WhatsAppProviderServices | null = null;

function resolveWhatsAppTransport(): WhatsAppTransport {
  const useMeta =
    import.meta.env.VITE_WHATSAPP_USE_META === "true" ||
    import.meta.env.PROD;
  return useMeta ? new MetaWhatsAppTransport() : new StubWhatsAppTransport();
}

export function getWhatsAppProviderServices(): WhatsAppProviderServices {
  if (!cached) cached = createWhatsAppProviderServices();
  return cached;
}

export * from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";
export { WhatsAppProvider, createWhatsAppProvider } from "@/lib/notifications/providers/whatsapp/services/whatsapp-provider";
export { WhatsAppRenderer, createDefaultWhatsAppRenderer } from "@/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer";
export { WhatsAppSettingsRepository } from "@/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
export { MetaWhatsAppTransport } from "@/lib/notifications/providers/whatsapp/adapter/meta-whatsapp-transport";
export { WHATSAPP_TEMPLATE_REGISTRY } from "@/lib/notifications/providers/whatsapp/templates/whatsapp-template-registry";
