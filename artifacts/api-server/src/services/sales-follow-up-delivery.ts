/**
 * Adapts sales follow-up delivery to the existing omnichannel outbound dispatch.
 * Channel adapters remain separate inside that pipeline; this file does not invent a sender.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceContext } from "@workspace/channel-platform";
import {
  SALES_FOLLOW_UP_OMNI_CHANNEL_KEY,
  loadSalesFollowUpChannelReadiness,
  type SalesFollowUpChannel,
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

export type SalesFollowUpChannelCompatibilityAssert = (input: {
  companyId: string;
  companyChannelId: string;
  channel: SalesFollowUpChannel;
}) => Promise<{ canSend: boolean; reason: string; channelKey: string | null }>;

async function defaultDispatch(
  ctx: ServiceContext,
  input: Parameters<OmnichannelSalesFollowUpDispatch>[1],
): Promise<Awaited<ReturnType<OmnichannelSalesFollowUpDispatch>>> {
  const { dispatchOmnichannelOutboundMessage } = await import("./omnichannel-outbound-dispatch.js");
  return dispatchOmnichannelOutboundMessage(ctx, input);
}

function createSupabaseChannelCompatibilityAssert(
  client: SupabaseClient,
): SalesFollowUpChannelCompatibilityAssert {
  return async (input) => {
    const readiness = await loadSalesFollowUpChannelReadiness(client, {
      companyId: input.companyId,
      companyChannelId: input.companyChannelId,
      expectedChannel: input.channel,
    });
    return {
      canSend: readiness.canSend,
      reason: readiness.reason,
      channelKey: readiness.channelKey,
    };
  };
}

export function createOmnichannelSalesFollowUpDelivery(
  ctx: ServiceContext,
  deps?: {
    dispatch?: OmnichannelSalesFollowUpDispatch;
    /** When set (production worker/approve), refuse WA→email channel mismatches before dispatch. */
    supabase?: SupabaseClient;
    assertChannelCompatible?: SalesFollowUpChannelCompatibilityAssert;
  },
): SalesFollowUpDeliveryPort {
  const dispatch = deps?.dispatch ?? defaultDispatch;
  const assertChannelCompatible =
    deps?.assertChannelCompatible ??
    (deps?.supabase ? createSupabaseChannelCompatibilityAssert(deps.supabase) : null);

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
        if (assertChannelCompatible) {
          const readiness = await assertChannelCompatible({
            companyId: input.companyId,
            companyChannelId: input.companyChannelId,
            channel: input.channel,
          });
          if (!readiness.canSend) {
            return {
              status: "failed",
              retryable: false,
              error:
                readiness.reason === "channel_type_mismatch"
                  ? `channel_type_mismatch: follow-up channel ${input.channel} cannot use company channel key ${readiness.channelKey ?? "unknown"}`
                  : `channel_not_ready:${readiness.reason}`,
            };
          }
        }

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
