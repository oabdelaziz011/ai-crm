import type { CommunicationChannel } from "@/lib/communication/types";
import type {
  CommunicationSendRequest,
  CommunicationSendResult,
} from "@/lib/communication/types/communication-types";
import type { CommunicationProvider } from "@/lib/communication/providers/communication-provider";
import { communicationTemplateRegistry } from "@/lib/communication/templates";
import { CommunicationPreferenceService } from "@/lib/communication/preferences/communication-preference-service";
import { CommunicationRateLimiter } from "@/lib/communication/utilities/rate-limiter";
import { buildCommunicationDedupeKey } from "@/lib/communication/utilities/dedupe-key";
import { safeCommunicationLog } from "@/lib/communication/utilities";

/** Central outbound communication orchestrator — modules call this, not providers. */
export class CommunicationDispatcher {
  private readonly providers = new Map<CommunicationChannel, CommunicationProvider>();
  private readonly dedupeCache = new Set<string>();
  private readonly rateLimiter = new CommunicationRateLimiter(120, 60_000);

  constructor(private readonly preferenceService: CommunicationPreferenceService) {}

  register(provider: CommunicationProvider): void {
    this.providers.set(provider.channel, provider);
  }

  hasProvider(channel: CommunicationChannel): boolean {
    return this.providers.has(channel);
  }

  async send(request: CommunicationSendRequest): Promise<CommunicationSendResult> {
    const template = communicationTemplateRegistry.resolve(request.templateKey);
    if (!template) {
      throw new Error(`Unknown communication template: ${request.templateKey}`);
    }

    const dedupeKey = buildCommunicationDedupeKey(request);
    if (this.deduplicateEnabled(request) && this.dedupeCache.has(dedupeKey)) {
      return { messageIds: [], queueIds: [], skippedChannels: request.channels, deduplicated: true };
    }

    const allowedChannels = await this.preferenceService.filterAllowedChannels(
      request.companyId,
      request.recipient,
      request.channels,
      request.templateKey,
    );

    const renderedVariables = {
      ...(request.variables ?? {}),
      customerName: request.recipient.name ?? request.variables?.customerName ?? "",
      email: request.recipient.email ?? "",
      phone: request.recipient.phone ?? "",
    };

    const messageIds: string[] = [];
    const queueIds: string[] = [];
    const skippedChannels: CommunicationChannel[] = [];

    for (const channel of request.channels) {
      if (!allowedChannels.includes(channel)) {
        skippedChannels.push(channel);
        continue;
      }

      if (!this.rateLimiter.tryAcquire(`${request.companyId}:${channel}`)) {
        skippedChannels.push(channel);
        safeCommunicationLog("warn", "Rate limit exceeded", { companyId: request.companyId, channel });
        continue;
      }

      const provider = this.providers.get(channel);
      if (!provider) {
        skippedChannels.push(channel);
        continue;
      }

      const outcome = await provider.send({
        ...request,
        notificationEvent: template.notificationEvent,
        renderedVariables,
      });

      if (outcome.notificationId) messageIds.push(outcome.notificationId);
      if (outcome.queueId) queueIds.push(outcome.queueId);
      if (outcome.status === "failed") {
        safeCommunicationLog("error", "Provider send failed", {
          channel,
          error: outcome.error ?? "unknown",
        });
      }
    }

    if (messageIds.length > 0 || queueIds.length > 0) {
      this.dedupeCache.add(dedupeKey);
    }

    return { messageIds, queueIds, skippedChannels, deduplicated: false };
  }

  private deduplicateEnabled(request: CommunicationSendRequest): boolean {
    return Boolean(request.idempotencyKey);
  }
}
