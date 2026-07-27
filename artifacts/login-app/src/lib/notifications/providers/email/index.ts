import { supabase } from "@/lib/supabase";
import { createEmailProvider } from "@/lib/notifications/providers/email/services/email-provider";
import { EmailRenderer } from "@/lib/notifications/providers/email/renderer/email-renderer";
import type { EmailTransport } from "@/lib/notifications/providers/email/types/email-types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { EmailSettingsRepository } from "@/lib/notifications/providers/email/services/email-settings-repository";
import { EmailDeliveryLogRepository } from "@/lib/notifications/providers/email/services/email-delivery-log-repository";

export type EmailProviderServices = {
  provider: ReturnType<typeof createEmailProvider>;
  settings: EmailSettingsRepository;
  deliveryLog: EmailDeliveryLogRepository;
};

const defaultRenderer = new EmailRenderer((key, params) => {
  const template = key.split(".").pop() ?? key;
  return `${template} ${Object.values(params).join(" ")}`.trim();
});

export function createEmailProviderServices(
  client: SupabaseClient = supabase,
  transport: EmailTransport,
  renderer: EmailRenderer = defaultRenderer,
): EmailProviderServices {
  return {
    provider: createEmailProvider(client, transport, renderer),
    settings: new EmailSettingsRepository(client),
    deliveryLog: new EmailDeliveryLogRepository(client),
  };
}

let cached: EmailProviderServices | null = null;
let loading: Promise<EmailProviderServices> | null = null;

async function loadEmailProviderServices(): Promise<EmailProviderServices> {
  const { SmtpEmailTransport } = await import(
    "@/lib/notifications/providers/email/adapter/smtp-email-transport"
  );
  return createEmailProviderServices(supabase, new SmtpEmailTransport());
}

/** Lazily loads nodemailer-backed transport on first email settings access. */
export async function ensureEmailProviderServices(): Promise<EmailProviderServices> {
  if (cached) return cached;
  if (!loading) {
    loading = loadEmailProviderServices().then((services) => {
      cached = services;
      return services;
    });
  }
  return loading;
}

export function getEmailProviderServices(): EmailProviderServices {
  if (!cached) {
    throw new Error("Email provider services not loaded — call ensureEmailProviderServices() first");
  }
  return cached;
}

export * from "@/lib/notifications/providers/email/types/email-types";
export { EmailProvider, createEmailProvider } from "@/lib/notifications/providers/email/services/email-provider";
export { EmailRenderer, createDefaultEmailRenderer } from "@/lib/notifications/providers/email/renderer/email-renderer";
export { EmailSettingsRepository } from "@/lib/notifications/providers/email/services/email-settings-repository";
export { EMAIL_TEMPLATE_REGISTRY } from "@/lib/notifications/providers/email/templates/email-template-registry";
