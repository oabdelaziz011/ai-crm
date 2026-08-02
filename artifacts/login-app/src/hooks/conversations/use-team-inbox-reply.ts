import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { useChannelPlatformServices } from "@/lib/channel-platform";
import { useConversationServices } from "@/lib/ai-conversation";
import {
  buildOutboundSendError,
  mapDispatchResponseToMessageStatus,
  OUTBOUND_METADATA,
  validateOutboundRoute,
  type OutboundRouteTarget,
  type OutboundSendError,
} from "@/lib/omnichannel/services/outbound-delivery";
import { resolveChannelSession } from "@/lib/omnichannel/services/channel-session-resolver";
import { dispatchOutboundMessage } from "@/lib/omnichannel/services/outbound-dispatch-service";
import { buildAttachmentMessageFields } from "@/lib/omnichannel/services/conversation-attachment-service";
import { dispatchComposerMentions } from "@/lib/omnichannel/services/composer-mention-service";
import type {
  ComposerMention,
  ComposerUploadedAttachment,
} from "@/lib/omnichannel/types/composer-enterprise-types";
import { conversationMessagesQueryKey } from "./use-conversation-messages";

type ReplyTarget = OutboundRouteTarget;

type ReplyMode = "reply" | "internal_note";

export type TeamInboxSendPayload = {
  text: string;
  mode: ReplyMode;
  attachments?: ComposerUploadedAttachment[];
  mentions?: ComposerMention[];
};

function mapAttachmentsForDispatch(attachments: ComposerUploadedAttachment[]) {
  return attachments.map((attachment) => ({
    attachmentId: attachment.id,
    type: attachment.kind === "image" ? ("image" as const) : ("document" as const),
    url: attachment.url,
    mimeType: attachment.mimeType,
    filename: attachment.name,
    metadata: { storagePath: attachment.storagePath, kind: attachment.kind },
  }));
}

function buildOptimisticMessage(
  target: ReplyTarget,
  payload: TeamInboxSendPayload,
  agentUserId: string | null,
  optimisticId: string,
  outboundPhase: "preparing" | "dispatching",
): ConversationMessageRecord {
  const now = new Date().toISOString();
  const attachmentFields = buildAttachmentMessageFields(payload.attachments ?? []);
  return {
    id: optimisticId,
    conversation_id: target.conversationId,
    participant_id: null,
    sequence_number: Date.now(),
    message_type: payload.mode === "internal_note" ? "internal_note" : "outgoing",
    content_type: attachmentFields.contentType,
    content: payload.text,
    metadata: {
      source: payload.mode === "internal_note" ? "omnichannel_internal_note" : "team_inbox",
      agentUserId,
      mentions: payload.mentions ?? [],
      attachments: attachmentFields.metadataAttachments,
      [OUTBOUND_METADATA.optimistic]: true,
      [OUTBOUND_METADATA.outboundPhase]: outboundPhase,
    },
    status: "pending",
    external_message_id: null,
    attachment_type: attachmentFields.attachmentType,
    attachment_url: attachmentFields.attachmentUrl,
    mime_type: attachmentFields.mimeType,
    file_size: attachmentFields.fileSize,
    search_text: payload.text,
    created_at: now,
    created_by: agentUserId,
  };
}

function patchOptimisticMessage(
  message: ConversationMessageRecord,
  patch: Partial<ConversationMessageRecord> & { metadata?: Record<string, unknown> },
): ConversationMessageRecord {
  return {
    ...message,
    ...patch,
    metadata: {
      ...(message.metadata ?? {}),
      ...(patch.metadata ?? {}),
    },
  };
}

export function useTeamInboxReply(companyId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { services: conversationServices, context: conversationContext } = useConversationServices();
  const { services: channelPlatform, context: channelContext } = useChannelPlatformServices();
  const [error, setError] = useState<OutboundSendError | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sendReply = useCallback(
    async (target: ReplyTarget, payload: TeamInboxSendPayload): Promise<boolean> => {
      const trimmed = payload.text.trim();
      const attachments = payload.attachments ?? [];
      if ((!trimmed && attachments.length === 0) || !companyId || isSending) return false;

      setError(null);
      setIsSending(true);

      const queryKey = conversationMessagesQueryKey(target.conversationId);
      let optimisticId: string | null = null;

      try {
        const attachmentFields = buildAttachmentMessageFields(attachments);
        const messageMetadata = {
          source: payload.mode === "internal_note" ? "omnichannel_internal_note" : "team_inbox",
          agentUserId: profile?.id ?? null,
          mentions: payload.mentions ?? [],
          attachments: attachmentFields.metadataAttachments,
          intelligenceEvents:
            (payload.mentions?.length ?? 0) > 0
              ? [
                  {
                    type: "agent_mention",
                    at: new Date().toISOString(),
                    actorUserId: profile?.id ?? null,
                    mentions: payload.mentions,
                  },
                ]
              : [],
          ...(payload.mode === "reply" ? { [OUTBOUND_METADATA.outboundPhase]: "preparing" } : {}),
        };

        if (payload.mode === "reply") {
          const session = await resolveChannelSession(target.conversationId);
          const routeCheck = validateOutboundRoute(session, target);
          if (!routeCheck.ok) {
            setError(buildOutboundSendError(routeCheck.issue));
            return false;
          }

          optimisticId = `optimistic-${Date.now()}`;
          queryClient.setQueryData<ConversationMessageRecord[]>(queryKey, (current) => [
            ...(current ?? []),
            buildOptimisticMessage(target, payload, profile?.id ?? null, optimisticId!, "preparing"),
          ]);

          const persisted = await conversationServices.messages.addMessage(conversationContext, {
            conversationId: target.conversationId,
            messageType: "outgoing",
            contentType: attachmentFields.contentType,
            content: trimmed || attachments.map((item) => item.name).join(", "),
            status: "pending",
            attachmentType: attachmentFields.attachmentType,
            attachmentUrl: attachmentFields.attachmentUrl,
            mimeType: attachmentFields.mimeType,
            fileSize: attachmentFields.fileSize,
            metadata: messageMetadata,
          });

          queryClient.setQueryData<ConversationMessageRecord[]>(queryKey, (current) =>
            (current ?? []).map((message) =>
              message.id === optimisticId
                ? patchOptimisticMessage(message, {
                    id: persisted.id,
                    sequence_number: persisted.sequence_number,
                    created_at: persisted.created_at,
                    metadata: {
                      [OUTBOUND_METADATA.optimistic]: true,
                      [OUTBOUND_METADATA.outboundPhase]: "dispatching",
                    },
                  })
                : message,
            ),
          );
          optimisticId = persisted.id;

          const route = routeCheck.route;
          const dispatchResponse = await dispatchOutboundMessage(
            route.channel_key,
            channelContext,
            channelPlatform.dispatcher,
            {
              companyId,
              companyChannelId: route.company_channel_id,
              channelKey: route.channel_key,
              conversationId: target.conversationId,
              channelSessionId: route.id,
              externalThreadId: route.external_thread_id,
              text: trimmed,
              attachments: mapAttachmentsForDispatch(attachments),
              outboundMessageId: persisted.id,
              persistConversationMessage: false,
              metadata: {
                source: "team_inbox",
                conversationMessageId: persisted.id,
                mentions: payload.mentions ?? [],
              },
            },
          );

          const confirmedStatus = mapDispatchResponseToMessageStatus(dispatchResponse.deliveryStatus);
          queryClient.setQueryData<ConversationMessageRecord[]>(queryKey, (current) =>
            (current ?? []).map((message) =>
              message.id === persisted.id
                ? patchOptimisticMessage(message, {
                    status: confirmedStatus,
                    external_message_id: dispatchResponse.externalMessageId ?? null,
                    metadata: {
                      [OUTBOUND_METADATA.optimistic]: false,
                      [OUTBOUND_METADATA.outboundPhase]: confirmedStatus,
                      [OUTBOUND_METADATA.dispatchConfirmed]: true,
                      [OUTBOUND_METADATA.dispatchFailed]: false,
                    },
                  })
                : message,
            ),
          );

          await dispatchComposerMentions({
            companyId,
            conversationId: target.conversationId,
            messageId: persisted.id,
            actorUserId: profile?.id ?? null,
            actorName: profile?.full_name ?? "Agent",
            mentions: payload.mentions ?? [],
            canNotify: true,
          });
        } else {
          const persisted = await conversationServices.messages.addMessage(conversationContext, {
            conversationId: target.conversationId,
            messageType: "internal_note",
            contentType: attachmentFields.contentType,
            content: trimmed || attachments.map((item) => item.name).join(", "),
            attachmentType: attachmentFields.attachmentType,
            attachmentUrl: attachmentFields.attachmentUrl,
            mimeType: attachmentFields.mimeType,
            fileSize: attachmentFields.fileSize,
            metadata: messageMetadata,
          });

          await dispatchComposerMentions({
            companyId,
            conversationId: target.conversationId,
            messageId: persisted.id,
            actorUserId: profile?.id ?? null,
            actorName: profile?.full_name ?? "Agent",
            mentions: payload.mentions ?? [],
            canNotify: true,
          });
        }

        await queryClient.invalidateQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
        await queryClient.invalidateQueries({ queryKey: ["outbound-channel-route", target.conversationId] });
        return true;
      } catch (err) {
        if (optimisticId) {
          queryClient.setQueryData<ConversationMessageRecord[]>(queryKey, (current) =>
            (current ?? []).filter((message) => message.id !== optimisticId),
          );
        }

        const detail = err instanceof Error ? err.message : "send_failed";
        setError({
          code: payload.mode === "reply" ? "dispatch_failed" : "send_failed",
          message:
            payload.mode === "reply"
              ? "The message could not be delivered to the customer channel."
              : "The internal note could not be saved.",
          detail,
        });
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [
      channelContext,
      channelPlatform.dispatcher,
      companyId,
      conversationContext,
      conversationServices.messages,
      isSending,
      profile?.full_name,
      profile?.id,
      queryClient,
    ],
  );

  const clearError = useCallback(() => setError(null), []);

  return { sendReply, isSending, error, clearError };
}

export type { OutboundSendError };
