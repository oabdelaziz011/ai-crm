/**
 * Adapts sales follow-up delivery to the existing omnichannel outbound dispatch.
 * Channel adapters remain separate inside that pipeline; this file does not invent a sender.
 */

import type { ServiceContext } from "@workspace/channel-platform";
import {
  SALES_FOLLOW_UP_OMNI_CHANNEL_KEY,
  type SalesFollowUpDeliveryPort,
  type SalesFollowUpDeliveryResult,
} from "@workspace/automation-platform";

export type OmnichannelSalesFollowUpDispatch = (
  ctx: ServiceContext,
  input: {
    companyId: string;
    conversationId: string;
    companyChannelId: string;
    channelKey: string;
    externalThreadId: string;
    text: string;
    metadata?: Record<string, unknown>;
    persistConversationMessage?: boolean;
  },
) => Promise<{
  deliveryStatus?: string | null;
  deliveryEventId?: string | null;
  externalMessageId?: string | null;
}>;

async function defaultDispatch(
  ctx: ServiceContext,
  input: Parameters<OmnichannelSalesFollowUpDispatch>[1],
): Promise<Awaited<ReturnType<OmnichannelSalesFollowUpDispatch>>> {
  const { dispatchOmnichannelOutboundMessage } = await import("./omnichannel-outbound-dispatch.js");
  return dispatchOmnichannelOutboundMessage(ctx, input);
}

export function createOmnichannelSalesFollowUpDelivery(
  ctx: ServiceContext,
  deps?: { dispatch?: OmnichannelSalesFollowUpDispatch },
): SalesFollowUpDeliveryPort {
  const dispatch = deps?.dispatch ?? defaultDispatch;
  return {
    async deliver(input): Promise<SalesFollowUpDeliveryResult> {
      const channelKey = SALES_FOLLOW_UP_OMNI_CHANNEL_KEY[input.channel];
      if (!channelKey) {
        return {
          status: "failed",
          retryable: false,
          error: `Channel ${input.channel} is not wired for automatic sales follow-up.`,
        };
      }
      try {
        const result = await dispatch(ctx, {
          companyId: input.companyId,
          conversationId: input.conversationId,
          companyChannelId: input.companyChannelId,
          channelKey,
          externalThreadId: input.externalThreadId,
          text: input.text,
          metadata: {
            source: "sales_follow_up",
            leadId: input.leadId,
            idempotencyKey: input.idempotencyKey,
          },
          persistConversationMessage: true,
        });
        const status = String(result.deliveryStatus ?? "").toLowerCase();
        const failed = status.includes("fail") || status === "error" || status === "rejected";
        if (failed) {
          return {
            status: "failed",
            retryable: true,
            error: `Provider delivery status: ${result.deliveryStatus}`,
          };
        }
        return {
          status: "delivered",
          providerMessageId: result.externalMessageId ?? result.deliveryEventId ?? null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Outbound dispatch failed.";
        const retryable = !/forbidden|not_found|validation|channel_not_found/i.test(message);
        return { status: "failed", retryable, error: message };
      }
    },
  };
}
