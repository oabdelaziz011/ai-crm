import type { NotificationQueueItem } from "@/lib/notifications/types";
import type { EmailRenderer } from "@/lib/notifications/providers/email/renderer/email-renderer";
import { EmailDeliveryLogRepository } from "@/lib/notifications/providers/email/services/email-delivery-log-repository";
import { EmailQueueConsumer } from "@/lib/notifications/providers/email/services/email-queue-consumer";
import { resolveRecipientEmail } from "@/lib/notifications/providers/email/services/email-recipient-resolver";
import { EmailRetryPolicy } from "@/lib/notifications/providers/email/services/email-retry-policy";
import { EmailSettingsRepository } from "@/lib/notifications/providers/email/services/email-settings-repository";
import type {
  EmailDeliveryResult,
  EmailTransport,
  EmailTransportHealthResult,
  SmtpConfig,
} from "@/lib/notifications/providers/email/types/email-types";
import { EMAIL_PROVIDER } from "@/lib/notifications/providers/email/types/email-types";
import type { EmailsSentCommercialPort } from "@workspace/channel-platform";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailProviderOptions = {
  /** Required — callers cannot construct a production-capable sender without commercial enforcement. */
  emailsSentCommercial: EmailsSentCommercialPort;
};

export type EmailProviderProcessResult = {
  processed: number;
  completed: number;
  failed: number;
  results: EmailDeliveryResult[];
};

/** Consumes email channel queue items — no business rules. */
export class EmailProvider {
  constructor(
    private readonly client: SupabaseClient,
    private readonly transport: EmailTransport,
    private readonly renderer: EmailRenderer,
    private readonly queueConsumer: EmailQueueConsumer,
    private readonly settingsRepository: EmailSettingsRepository,
    private readonly deliveryLogRepository: EmailDeliveryLogRepository,
    private readonly emailsSentCommercial: EmailsSentCommercialPort,
  ) {}

  private async assertCommercialAccess(companyId: string): Promise<void> {
    const scopedCompanyId = companyId?.trim();
    if (!scopedCompanyId) {
      throw new Error("Email commercial access unavailable.");
    }
    const access = await this.emailsSentCommercial.checkAccess({
      companyId: scopedCompanyId,
    });
    if (!access.allowed) {
      throw new Error(
        access.reason === "quota_exceeded"
          ? "Email send quota exceeded."
          : access.reason === "not_entitled"
            ? "Email channel is not entitled."
            : "Email commercial access unavailable.",
      );
    }
  }

  async healthCheck(companyId: string): Promise<EmailTransportHealthResult & { enabled: boolean }> {
    const settings = await this.settingsRepository.getSecure(companyId);
    if (!settings?.enabled) {
      return {
        ok: false,
        provider: this.transport.provider,
        latencyMs: 0,
        enabled: false,
        error: "Email provider is disabled",
      };
    }
    const result = await this.transport.healthCheck(this.toSmtpConfig(settings));
    return { ...result, enabled: true };
  }

  async testConnection(companyId: string, recipientEmail: string): Promise<EmailDeliveryResult> {
    const rendered = this.renderer.renderEvent("generic_system", {
      detail: "SMTP connection test",
    });
    return this.sendDirect(companyId, {
      to: recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      queueId: "test",
    });
  }

  /**
   * Send a pre-rendered message via company SMTP settings (server-side credentials only).
   * Used by connection tests and Email Template test-send.
   */
  async sendDirect(
    companyId: string,
    message: {
      to: string;
      subject: string;
      html: string;
      text: string;
      queueId?: string;
    },
  ): Promise<EmailDeliveryResult> {
    const settings = await this.settingsRepository.getSecure(companyId);
    if (!settings?.enabled) {
      throw new Error("Email provider is disabled");
    }
    if (!settings.smtpHost || !settings.fromEmail) {
      throw new Error("Outbound email is not configured");
    }

    await this.assertCommercialAccess(companyId);

    const queueId = message.queueId ?? "direct";
    const started = Date.now();
    try {
      await this.transport.send(
        {
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        },
        this.toSmtpConfig(settings),
      );
      const result: EmailDeliveryResult = {
        queueId,
        notificationId: null,
        companyId,
        provider: EMAIL_PROVIDER,
        status: "completed",
        durationMs: Date.now() - started,
        attempts: 1,
        lastError: null,
        recipientEmail: message.to,
        subject: message.subject,
        timestamp: new Date().toISOString(),
      };
      await this.deliveryLogRepository.append(result);
      return result;
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      const result: EmailDeliveryResult = {
        queueId,
        notificationId: null,
        companyId,
        provider: EMAIL_PROVIDER,
        status: "failed",
        durationMs: Date.now() - started,
        attempts: 1,
        lastError: errMessage,
        recipientEmail: message.to,
        subject: message.subject,
        timestamp: new Date().toISOString(),
      };
      await this.deliveryLogRepository.append(result);
      throw error;
    }
  }

  async processPending(companyId: string, limit = 25): Promise<EmailProviderProcessResult> {
    const settings = await this.settingsRepository.getSecure(companyId);
    if (!settings?.enabled) {
      return { processed: 0, completed: 0, failed: 0, results: [] };
    }

    const retryPolicy = new EmailRetryPolicy(settings.maxRetryCount);
    const pending = await this.queueConsumer.listPendingEmail(companyId, limit);
    const results: EmailDeliveryResult[] = [];
    let completed = 0;
    let failed = 0;

    for (const item of pending) {
      const result = await this.processQueueItem(item, settings.maxRetryCount, retryPolicy);
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
    maxRetryCount: number,
    retryPolicy: EmailRetryPolicy,
  ): Promise<EmailDeliveryResult> {
    const started = Date.now();
    const params = this.extractParams(item.payload);
    const event = String(item.payload.event ?? "generic_system");
    const attempts = item.retryCount + 1;

    await this.queueConsumer.markProcessing(item.companyId, item.id);

    try {
      const settings = await this.settingsRepository.getSecure(item.companyId);
      if (!settings?.enabled) {
        throw new Error("Email provider is disabled");
      }

      const recipientEmail = await resolveRecipientEmail(
        this.client,
        item.notificationId,
        params,
      );
      if (!recipientEmail) {
        throw new Error("No recipient email resolved");
      }

      const rendered = this.renderer.renderEvent(event, params);

      try {
        await this.assertCommercialAccess(item.companyId);
      } catch (commercialError) {
        const denialMessage =
          commercialError instanceof Error
            ? commercialError.message
            : "Email commercial access unavailable.";
        await this.queueConsumer.markFailed(
          item.companyId,
          item.id,
          denialMessage,
          maxRetryCount,
          undefined,
        );
        const denied: EmailDeliveryResult = {
          queueId: item.id,
          notificationId: item.notificationId,
          companyId: item.companyId,
          provider: EMAIL_PROVIDER,
          status: "failed",
          durationMs: Date.now() - started,
          attempts,
          lastError: denialMessage,
          recipientEmail,
          subject: rendered.subject,
          timestamp: new Date().toISOString(),
        };
        await this.deliveryLogRepository.append(denied);
        return denied;
      }

      await this.transport.send(
        {
          to: recipientEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        },
        this.toSmtpConfig(settings),
      );

      await this.queueConsumer.markCompleted(item.companyId, item.id);

      await this.emailsSentCommercial
        .recordUsage({
          companyId: item.companyId,
          queueId: item.id,
        })
        .catch(() => undefined);

      const result: EmailDeliveryResult = {
        queueId: item.id,
        notificationId: item.notificationId,
        companyId: item.companyId,
        provider: EMAIL_PROVIDER,
        status: "completed",
        durationMs: Date.now() - started,
        attempts,
        lastError: null,
        recipientEmail,
        subject: rendered.subject,
        timestamp: new Date().toISOString(),
      };
      await this.deliveryLogRepository.append(result);
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

      const result: EmailDeliveryResult = {
        queueId: item.id,
        notificationId: item.notificationId,
        companyId: item.companyId,
        provider: EMAIL_PROVIDER,
        status: "failed",
        durationMs: Date.now() - started,
        attempts,
        lastError: message,
        recipientEmail: null,
        subject: null,
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

  private toSmtpConfig(settings: {
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string;
    smtpEncryption: SmtpConfig["encryption"];
    fromEmail: string;
    fromName: string;
  }): SmtpConfig {
    return {
      host: settings.smtpHost,
      port: settings.smtpPort,
      username: settings.smtpUsername,
      password: settings.smtpPassword,
      encryption: settings.smtpEncryption,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
    };
  }
}

export function createEmailProvider(
  client: SupabaseClient,
  transport: EmailTransport,
  renderer: EmailRenderer,
  options: EmailProviderOptions,
): EmailProvider {
  if (!options.emailsSentCommercial) {
    throw new Error("EmailProvider requires emailsSentCommercial for commercial enforcement.");
  }
  return new EmailProvider(
    client,
    transport,
    renderer,
    new EmailQueueConsumer(client),
    new EmailSettingsRepository(client),
    new EmailDeliveryLogRepository(client),
    options.emailsSentCommercial,
  );
}
