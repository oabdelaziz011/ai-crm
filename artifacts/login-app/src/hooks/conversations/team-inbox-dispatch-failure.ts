import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { ProviderAcceptanceUnconfirmedError } from "@workspace/channel-platform/client";
import { OUTBOUND_METADATA } from "@/lib/omnichannel/services/outbound-delivery";

export function isTeamInboxAcceptanceUnconfirmed(error: unknown): boolean {
  return (
    error instanceof ProviderAcceptanceUnconfirmedError ||
    (error instanceof Error && error.name === "ProviderAcceptanceUnconfirmedError")
  );
}

type ConfirmClient = {
  rpc: (
    fn: string,
    args: { p_message_id: string; p_status: string; p_external_message_id: null },
  ) => PromiseLike<{ error: { message: string } | null }>;
};

type MessageCache = {
  setQueryData: (
    queryKey: readonly unknown[],
    updater: (current: ConversationMessageRecord[] | undefined) => ConversationMessageRecord[],
  ) => void;
};

/**
 * Persist a team-inbox dispatch failure.
 * An unconfirmed provider result is left untouched: no failed confirm and no second send.
 */
export async function persistTeamInboxDispatchFailure(input: {
  error: unknown;
  optimisticId: string | null;
  mode: "reply" | "note";
  queryKey: readonly unknown[];
  supabase: ConfirmClient;
  queryClient: MessageCache;
  patchMessage: (
    message: ConversationMessageRecord,
    patch: Partial<ConversationMessageRecord> & { metadata?: Record<string, unknown> },
  ) => ConversationMessageRecord;
}): Promise<{ acceptanceUnconfirmed: boolean; confirmedFailed: boolean }> {
  const acceptanceUnconfirmed = isTeamInboxAcceptanceUnconfirmed(input.error);
  if (!input.optimisticId || acceptanceUnconfirmed) {
    return { acceptanceUnconfirmed, confirmedFailed: false };
  }

  const persistedId = input.optimisticId.startsWith("optimistic-") ? null : input.optimisticId;
  if (persistedId && input.mode === "reply") {
    const detail = input.error instanceof Error ? input.error.message : "send_failed";
    try {
      const { error: confirmError } = await input.supabase.rpc("confirm_conversation_message_outbound", {
        p_message_id: persistedId,
        p_status: "failed",
        p_external_message_id: null,
      });
      if (confirmError) {
        console.warn("[team-inbox] confirm outbound failed after send error", {
          messageId: persistedId,
          error: confirmError.message,
        });
      }
    } catch {
      // best-effort failure persistence
    }
    input.queryClient.setQueryData(input.queryKey, (current) =>
      (current ?? []).map((message) =>
        message.id === persistedId
          ? input.patchMessage(message, {
              status: "failed",
              metadata: {
                [OUTBOUND_METADATA.optimistic]: false,
                [OUTBOUND_METADATA.outboundPhase]: "failed",
                [OUTBOUND_METADATA.dispatchFailed]: true,
                [OUTBOUND_METADATA.dispatchError]: detail.slice(0, 400),
                [OUTBOUND_METADATA.dispatchConfirmed]: false,
              },
            })
          : message,
      ),
    );
    return { acceptanceUnconfirmed: false, confirmedFailed: true };
  }

  input.queryClient.setQueryData(input.queryKey, (current) =>
    (current ?? []).filter((message) => message.id !== input.optimisticId),
  );
  return { acceptanceUnconfirmed: false, confirmedFailed: false };
}
