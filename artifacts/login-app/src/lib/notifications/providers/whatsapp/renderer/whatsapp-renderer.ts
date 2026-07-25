import type { TFunction } from "i18next";
import {
  renderWhatsAppFromRegistry,
  type WhatsAppRenderFn,
} from "@/lib/notifications/providers/whatsapp/templates/whatsapp-template-registry";
import type { RenderedWhatsAppMessage } from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

/** Renders WhatsApp message payloads from template registry. No transport logic. */
export class WhatsAppRenderer {
  constructor(private readonly render: WhatsAppRenderFn) {}

  static fromI18n(t: TFunction): WhatsAppRenderer {
    return new WhatsAppRenderer((key, params) => t(key, params));
  }

  renderEvent(
    event: string,
    params: Record<string, string> = {},
    languageCode = "en",
  ): RenderedWhatsAppMessage {
    return renderWhatsAppFromRegistry(event, params, languageCode, this.render);
  }
}

export function createDefaultWhatsAppRenderer(t: TFunction): WhatsAppRenderer {
  return WhatsAppRenderer.fromI18n(t);
}
