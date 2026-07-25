import type { TFunction } from "i18next";
import {
  renderEmailFromRegistry,
  type EmailRenderFn,
} from "@/lib/notifications/providers/email/templates/email-template-registry";
import type { RenderedEmail } from "@/lib/notifications/providers/email/types/email-types";

/** Renders email content from template registry. No transport logic. */
export class EmailRenderer {
  constructor(private readonly render: EmailRenderFn) {}

  static fromI18n(t: TFunction): EmailRenderer {
    return new EmailRenderer((key, params) => t(key, params));
  }

  renderEvent(event: string, params: Record<string, string> = {}): RenderedEmail {
    return renderEmailFromRegistry(event, params, this.render);
  }
}

export function createDefaultEmailRenderer(t: TFunction): EmailRenderer {
  return EmailRenderer.fromI18n(t);
}
