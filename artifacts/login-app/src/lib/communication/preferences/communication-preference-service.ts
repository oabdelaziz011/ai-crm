import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunicationChannel, CommunicationTemplateKey } from "@/lib/communication/types";
import type { CommunicationRecipient } from "@/lib/communication/types/communication-types";
import { CustomerCommunicationPreferencesRepository } from "@/lib/communication/preferences/customer-communication-preferences-repository";
import { getNotificationServices } from "@/lib/notifications";

const MARKETING_TEMPLATES = new Set<CommunicationTemplateKey>([
  "marketing_campaign",
  "birthday_greeting",
]);

export class CommunicationPreferenceService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly customerPrefs: CustomerCommunicationPreferencesRepository,
  ) {}

  async filterAllowedChannels(
    companyId: string,
    recipient: CommunicationRecipient,
    channels: CommunicationChannel[],
    templateKey: CommunicationTemplateKey,
  ): Promise<CommunicationChannel[]> {
    const inQuietHours = await this.isQuietHours(companyId, recipient);
    if (inQuietHours) return [];

    let allowed = [...channels];

    if (recipient.customerId) {
      const prefs = await this.customerPrefs.get(recipient.customerId, companyId);
      allowed = allowed.filter((channel) => {
        if (channel === "whatsapp" && !prefs.receiveWhatsapp) return false;
        if (channel === "email" && !prefs.receiveEmail) return false;
        if (channel === "sms" && !prefs.receiveSms) return false;
        if (MARKETING_TEMPLATES.has(templateKey) && !prefs.receiveMarketing) return false;
        return true;
      });
    }

    const notificationPrefs = getNotificationServices().preferenceService;
    const tenantPrefs = await notificationPrefs.list(companyId);
    allowed = allowed.filter((channel) =>
      notificationPrefs.shouldDeliver(
        tenantPrefs,
        { userId: recipient.userId ?? null, companyId },
        channel as never,
        "normal",
      ),
    );

    return allowed;
  }

  private async isQuietHours(companyId: string, recipient: CommunicationRecipient): Promise<boolean> {
    if (!recipient.customerId) return false;
    const prefs = await this.customerPrefs.get(recipient.customerId, companyId);
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

    const now = new Date();
    const [startH, startM] = prefs.quietHoursStart.split(":").map(Number);
    const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const start = (startH ?? 0) * 60 + (startM ?? 0);
    const end = (endH ?? 0) * 60 + (endM ?? 0);

    if (start <= end) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  }
}
