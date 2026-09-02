import type { NotificationQueueItem } from "@/lib/notifications/types";
import type { WhatsAppRenderer } from "@/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer";
import { WhatsAppDeliveryLogRepository } from "@/lib/notifications/providers/whatsapp/services/whatsapp-delivery-log-repository";
import { WhatsAppQueueConsumer } from "@/lib/notifications/providers/whatsapp/services/whatsapp-queue-consumer";
import { validateRecipientPhone } from "@/lib/notifications/providers/whatsapp/services/whatsapp-phone-validator";
import { resolveRecipientPhone } from "@/lib/notifications/providers/whatsapp/services/whatsapp-recipient-resolver";
import { resolveWhatsAppOutboundPhone } from "@/lib/notifications/providers/whatsapp/services/whatsapp-outbound-phone";
import { WhatsAppRetryPolicy } from "@/lib/notifications/providers/whatsapp/services/whatsapp-retry-policy";
import { WhatsAppSettingsRepository } from "@/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
import type {
  CompanyWhatsAppSettings,
  MetaWhatsAppConfig,
  WhatsAppDeliveryResult,
  WhatsAppTransport,
  WhatsAppTransportHealthResult,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";
import { WHATSAPP_PROVIDER } from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";
import type { WhatsAppMessagesCommercialPort } from "@workspace/channel-platform";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileCampaignRecipientSendSuccess } from "@/lib/campaigns/reconcile-campaign-recipient-delivery";

export type WhatsAppProviderOptions = {
  /** Required — callers cannot construct a production-capable sender without commercial enforcement. */
  whatsappMessagesCommercial: WhatsAppMessagesCommercialPort;
};

export type WhatsAppProviderProcessResult = {
  processed: number;
  completed: number;
  failed: number;
  results: WhatsAppDeliveryResult[];
};

/** Consumes whatsapp channel queue items — no business rules. */
export class WhatsAppProvider {
  constructor(
    private readonly client: SupabaseClient,
    private readonly transport: WhatsAppTransport,
    private readonly renderer: WhatsAppRenderer,
    private readonly queueConsumer: WhatsAppQueueConsumer,
    private readonly settingsRepository: WhatsAppSettingsRepository,
    private readonly deliveryLogRepository: WhatsAppDeliveryLogRepository,
    private readonly whatsappMessagesCommercial: WhatsAppMessagesCommercialPort,
  ) {}

  private async assertCommercialAccess(companyId: string): Promise<void> {
    const scopedCompanyId = companyId?.trim();
    if (!scopedCompanyId) {
      throw new Error("WhatsApp commercial access unavailable.");
    }
    const access = await this.whatsappMessagesCommercial.checkAccess({
      companyId: scopedCompanyId,
    });
    if (!access.allowed) {
      throw new Error(
        access.reason === "quota_exceeded"
          ? "WhatsApp message quota exceeded."
          : access.reason === "not_entitled"
            ? "WhatsApp channel is not entitled."
            : "WhatsApp commercial access unavailable.",
      );
    }
  }

  async healthCheck(
    companyId: string,
  ): Promise<WhatsAppTransportHealthResult & { enabled: boolean }> {
    const settings = await this.settingsRepository.getSecure(companyId);
    if (!settings?.enabled) {
      return {
        ok: false,
        provider: this.transport.provider,
        latencyMs: 0,
        enabled: false,
        error: "WhatsApp provider is disabled",
      };
    }
    const result = await this.transport.healthCheck(this.toMetaConfig(settings));
    return { ...result, enabled: true };
  }

  async sendTestMessage(companyId: string, recipientPhone: string): Promise<WhatsAppDeliveryResult> {
    await this.assertCommercialAccess(companyId);
    const settings = await this.settingsRepository.getSecure(companyId);
    if (!settings?.enabled) {
      throw new Error("WhatsApp provider is disabled");
    }
    this.assertCredentialsSendable(settings);

    const rendered = this.renderer.renderEvent(
      "generic_system",
      { detail: "WhatsApp connection test" },
      settings.defaultLanguage,
    );

    // D5.1 — test messages use canonical outbound resolution (no Egypt-guess).
    const outbound = resolveWhatsAppOutboundPhone({ phone: recipientPhone });
    const phoneValidation = outbound.ok
      ? validateRecipientPhone(outbound.phone)
      : { valid: false as const, normalized: null, error: outbound.reason };
    if (!phoneValidation.valid || !phoneValidation.normalized) {
      throw new Error(`Invalid recipient phone: ${phoneValidation.error ?? "invalid"}`);
    }

    const started = Date.now();
    try {
      const sendResult = await this.transport.send(
        {
          to: phoneValidation.normalized,
          templateKey: rendered.templateKey,
          templateId: rendered.templateId,
          languageCode: rendered.languageCode,
          bodyParameters: rendered.bodyParameters,
          fallbackText: rendered.fallbackText,
        },
        this.toMetaConfig(settings),
      );

      const result: WhatsAppDeliveryResult = {
        queueId: "test",
        notificationId: null,
        companyId,
        provider: WHATSAPP_PROVIDER,
        status: "completed",
        durationMs: Date.now() - started,
        attempts: 1,
        lastError: null,
        recipientPhone,
        messageId: sendResult.messageId,
        templateKey: rendered.templateKey,
        timestamp: new Date().toISOString(),
      };
      await this.deliveryLogRepository.append(result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: WhatsAppDeliveryResult = {
        queueId: "test",
        notificationId: null,
        companyId,
        provider: WHATSAPP_PROVIDER,
        status: "failed",
        durationMs: Date.now() - started,
        attempts: 1,
        lastError: message,
        recipientPhone,
        messageId: null,
        templateKey: rendered.templateKey,
        timestamp: new Date().toISOString(),
      };
      await this.deliveryLogRepository.append(result);
      throw error;
    }
  }

  async processPending(companyId: string, limit = 25): Promise<WhatsAppProviderProcessResult> {
    const settings = await this.settingsRepository.getSecure(companyId);
    if (!settings?.enabled) {
      return { processed: 0, completed: 0, failed: 0, results: [] };
    }

    const retryPolicy = new WhatsAppRetryPolicy(settings.maxRetryCount);
    const pending = await this.queueConsumer.listPendingWhatsApp(companyId, limit);
    const results: WhatsAppDeliveryResult[] = [];
    let completed = 0;
    let failed = 0;

    for (const item of pending) {
      const result = await this.processQueueItem(item, settings, retryPolicy);
      results.push(result);
      if (result.status === "completed") completed += 1;
      else failed += 1;
    }

    return {
      processed: pending.length,
      completed,
      failed,
      results,
    };
  }

  private async processQueueItem(
    item: NotificationQueueItem,
    settings: CompanyWhatsAppSettings,
    retryPolicy: WhatsAppRetryPolicy,
  ): Promise<WhatsAppDeliveryResult> {
    const started = Date.now();
    const params = this.extractParams(item.payload);
    const event = String(item.payload.event ?? "generic_system");
    const attempts = item.retryCount + 1;

    await this.queueConsumer.markProcessing(item.companyId, item.id);

    try {
      this.assertCredentialsSendable(settings);

      const recipient = await resolveRecipientPhone(this.client, {
        ...params,
        companyId: params.companyId || item.companyId,
      });
      if (!recipient.phone) {
        const reason = recipient.validation.error ?? recipient.optIn.reason ?? "no_recipient";
        throw new Error(`Recipient phone unavailable: ${reason}`);
      }

      const languageCode = params.language ?? params.locale ?? settings.defaultLanguage;
      const rendered = this.renderer.renderEvent(event, params, languageCode);

      try {
        await this.assertCommercialAccess(item.companyId);
      } catch (commercialError) {
        const denialMessage =
          commercialError instanceof Error
            ? commercialError.message
            : "WhatsApp commercial access unavailable.";
        await this.queueConsumer.markFailed(
          item.companyId,
          item.id,
          denialMessage,
          settings.maxRetryCount,
          undefined,
        );
        const denied: WhatsAppDeliveryResult = {
          queueId: item.id,
          notificationId: item.notificationId,
          companyId: item.companyId,
          provider: WHATSAPP_PROVIDER,
          status: "failed",
          durationMs: Date.now() - started,
          attempts,
          lastError: denialMessage,
          recipientPhone: recipient.phone,
          messageId: null,
          templateKey: rendered.templateKey,
          timestamp: new Date().toISOString(),
        };
        await this.deliveryLogRepository.append(denied);
        return denied;
      }

      const sendResult = await this.transport.send(
        {
          to: recipient.phone,
          templateKey: rendered.templateKey,
          templateId: rendered.templateId,
          languageCode: rendered.languageCode,
          bodyParameters: rendered.bodyParameters,
          fallbackText: rendered.fallbackText,
        },
        this.toMetaConfig(settings),
      );

      const messageId = sendResult.messageId?.trim() ?? "";
      if (!messageId) {
        throw new Error("WhatsApp API did not return an outbound message id.");
      }

      await this.queueConsumer.markCompleted(item.companyId, item.id);

      await this.whatsappMessagesCommercial
        .recordUsage({
          companyId: item.companyId,
          externalMessageId: messageId,
          usageSource: "notification_queue",
          referenceType: "notification_queue",
          referenceId: item.id,
        })
        .catch(() => undefined);

      const result: WhatsAppDeliveryResult = {
        queueId: item.id,
        notificationId: item.notificationId,
        companyId: item.companyId,
        provider: WHATSAPP_PROVIDER,
        status: "completed",
        durationMs: Date.now() - started,
        attempts,
        lastError: null,
        recipientPhone: recipient.phone,
        messageId,
        templateKey: rendered.templateKey,
        timestamp: new Date().toISOString(),
      };
      await this.deliveryLogRepository.append(result);
      // Campaign WhatsApp: link Meta wamid onto marketing_campaign_recipients
      // via company_id + notification_queue_id (no phone matching).
      await reconcileCampaignRecipientSendSuccess(this.client, {
        companyId: item.companyId,
        queueId: item.id,
        providerMessageId: messageId,
      }).catch(() => undefined);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const decision = retryPolicy.evaluate(item.retryCount);
      const rescheduleAt = decision.shouldRetry
        ? new Date(Date.now() + decision.delayMs).toISOString()
        : undefined;

      await this.queueConsumer.markFailed(
        item.companyId,
        item.id,
        message,
        decision.nextAttempt,
        rescheduleAt,
      );

      const result: WhatsAppDeliveryResult = {
        queueId: item.id,
        notificationId: item.notificationId,
        companyId: item.companyId,
        provider: WHATSAPP_PROVIDER,
        status: "failed",
        durationMs: Date.now() - started,
        attempts,
        lastError: message,
        recipientPhone: null,
        messageId: null,
        templateKey: null,
        timestamp: new Date().toISOString(),
      };
      await this.deliveryLogRepository.append(result);
      return result;
    }
  }

  private extractParams(payload: Record<string, unknown>): Record<string, string> {
    const raw = payload.params;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]),
    );
  }

  private assertCredentialsSendable(settings: CompanyWhatsAppSettings): void {
    if (settings.tokenStatus === "missing" || !settings.hasAccessToken) {
      throw new Error(
        "WhatsApp access token is missing. Update Settings → WhatsApp credentials.",
      );
    }
    if (settings.tokenStatus === "expired") {
      const when = settings.tokenExpiresAt ? ` Token expired at ${settings.tokenExpiresAt}.` : "";
      const last = settings.lastAuthError?.trim()
        ? ` Last Meta error: ${settings.lastAuthError.trim()}`
        : "";
      throw new Error(
        `WhatsApp access token is expired.${when}${last} Update Settings → WhatsApp credentials and run Test Connection.`.trim(),
      );
    }
    if (settings.tokenStatus === "invalid") {
      throw new Error(
        settings.lastAuthError?.trim() ||
          "WhatsApp access token is invalid. Update Settings → WhatsApp credentials.",
      );
    }
    if (settings.tokenExpiresAt) {
      const expiresAt = Date.parse(settings.tokenExpiresAt);
      if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
        throw new Error(
          `WhatsApp access token is expired. Token expired at ${settings.tokenExpiresAt}. Update Settings → WhatsApp credentials and run Test Connection.`,
        );
      }
    }
  }

  private toMetaConfig(settings: CompanyWhatsAppSettings): MetaWhatsAppConfig {
    return {
      accessToken: settings.accessToken,
      phoneNumberId: settings.phoneNumberId,
      businessAccountId: settings.businessAccountId,
      webhookVerifyToken: settings.webhookVerifyToken,
      apiVersion: settings.apiVersion,
      appSecret: settings.appSecret || undefined,
      defaultLanguage: settings.defaultLanguage,
    };
  }
}

export function createWhatsAppProvider(
  client: SupabaseClient,
  transport: WhatsAppTransport,
  renderer: WhatsAppRenderer,
  options: WhatsAppProviderOptions,
): WhatsAppProvider {
  if (!options?.whatsappMessagesCommercial) {
    throw new Error(
      "WhatsAppMessagesCommercialPort is required — cannot construct WhatsApp sender without commercial enforcement.",
    );
  }
  return new WhatsAppProvider(
    client,
    transport,
    renderer,
    new WhatsAppQueueConsumer(client),
    new WhatsAppSettingsRepository(client),
    new WhatsAppDeliveryLogRepository(client),
    options.whatsappMessagesCommercial,
  );
}
