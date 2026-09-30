import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
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
import { canViewPublicWebChatInbox } from "@/lib/omnichannel/permissions";
import {
  confirmPublicWebChatVisitorPollingReply,
  PUBLIC_WEB_CHAT_DELIVERY_MODE,
  resolvePublicWebChatReplyPlan,
  type PublicWebChatReplyClient,
} from "@/lib/omnichannel/services/public-web-chat-reply";
import type {
  ComposerMention,
  ComposerUploadedAttachment,
} from "@/lib/omnichannel/types/composer-enterprise-types";
import { conversationMessagesQueryKey } from "./use-conversation-messages";
import { supabase } from "@/lib/supabase";
import {
  beginOmniSendRun,
  detectOmniSendStall,
  markOmniSendFirstStop,
  traceOmniSendAsync,
  traceOmniSendEnter,
  traceOmniSendExit,
} from "@/lib/omnichannel/debug/omni-send-pipeline-audit";

type ReplyTarget = OutboundRouteTarget;

type ReplyMode = "reply" | "internal_note";

export type TeamInboxProviderAttachment = {
  attachmentId: string;
  type: "image" | "document" | "audio" | "video";
  mimeType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
};

export type TeamInboxSendPayload = {
  text: string;
  mode: ReplyMode;
  attachments?: ComposerUploadedAttachment[];
  /** Already-addressable provider media, such as a WhatsApp media id. */
  providerAttachments?: TeamInboxProviderAttachment[];
  mentions?: ComposerMention[];
  /**
   * Email Workspace — outbound metadata for Reply / Reply All / Forward / Compose.
   * Merged into dispatch metadata when channelKey is email (never auto-send).
   */
  emailOutbound?: Record<string, unknown>;
};

function dispatchAttachmentType(attachment: ComposerUploadedAttachment): "image" | "document" | "audio" | "video" {
  if (attachment.kind === "image" || attachment.mimeType.startsWith("image/")) return "image";
  if (attachment.mimeType.startsWith("audio/")) return "audio";
  if (attachment.mimeType.startsWith("video/")) return "video";
  return "document";
}

function mapAttachmentsForDispatch(attachments: ComposerUploadedAttachment[]) {
  return attachments.map((attachment) => ({
    attachmentId: attachment.id,
    type: dispatchAttachmentType(attachment),
    // H3: do not send persisted/long-lived signed URLs — pipeline remints from storagePath.
    url: undefined,
    mimeType: attachment.mimeType,
    filename: attachment.name,
    metadata: { storagePath: attachment.storagePath, kind: attachment.kind },
  }));
}

function emailHtmlFromOutbound(emailOutbound?: Record<string, unknown>): string | null {
  if (!emailOutbound || typeof emailOutbound !== "object") return null;
  const html = emailOutbound.htmlSanitized;
  return typeof html === "string" && html.trim() ? html.trim() : null;
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
  const htmlSanitized = emailHtmlFromOutbound(payload.emailOutbound);
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
      // Persist outbound HTML so thread rendering can show body → logo → signature.
      ...(htmlSanitized ? { htmlSanitized } : {}),
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
  const { profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const { services: conversationServices, context: conversationContext } = useConversationServices();
  const { services: channelPlatform, context: channelContext } = useChannelPlatformServices();
  const [error, setError] = useState<OutboundSendError | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sendReply = useCallback(
    async (target: ReplyTarget, payload: TeamInboxSendPayload): Promise<boolean> => {
      const trimmed = payload.text.trim();
      const attachments = payload.attachments ?? [];
      const providerAttachments = payload.providerAttachments ?? [];
      if (
        (!trimmed && attachments.length === 0 && providerAttachments.length === 0) ||
        !companyId ||
        isSending
      ) {
        return false;
      }

      const runId = beginOmniSendRun({
        conversationId: target.conversationId,
        extra: { mode: payload.mode, channelKey: target.channelKey },
      });

      setError(null);
      setIsSending(true);

      const queryKey = conversationMessagesQueryKey(target.conversationId);
      let optimisticId: string | null = null;

      try {
        traceOmniSendEnter({
          runId,
          layer: 2,
          stage: "useSendMessage.sendReply",
          file: "use-team-inbox-reply.ts",
          function: "sendReply",
          line: 123,
          conversationId: target.conversationId,
          extra: { mode: payload.mode },
        });
        const attachmentFields = buildAttachmentMessageFields(attachments);
        const providerMeta = providerAttachments.map((item) => ({
          id: item.attachmentId,
          name: item.filename ?? item.type,
          type: item.type,
          mimeType: item.mimeType ?? null,
          whatsappMediaId: item.metadata?.whatsappMediaId ?? item.attachmentId,
        }));
        const htmlSanitized = emailHtmlFromOutbound(payload.emailOutbound);
        const messageMetadata = {
          source: payload.mode === "internal_note" ? "omnichannel_internal_note" : "team_inbox",
          agentUserId: profile?.id ?? null,
          mentions: payload.mentions ?? [],
          attachments: [...attachmentFields.metadataAttachments, ...providerMeta],
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
          // Same HTML passed to SMTP/Graph — required for sent-thread logo rendering.
          ...(htmlSanitized ? { htmlSanitized } : {}),
        };

        if (payload.mode === "reply") {
          const replyClient = supabase as unknown as PublicWebChatReplyClient;
          let isPublicWebChat = false;
          if (target.channelKey === "web_chat") {
            const plan = await resolvePublicWebChatReplyPlan(replyClient, {
              conversationId: target.conversationId,
              companyId,
              hasAttachments: attachments.length > 0 || providerAttachments.length > 0,
              canViewPublicWebChat: canViewPublicWebChatInbox({
                userId: profile?.id ?? "",
                companyId,
                isSuperAdmin: Boolean(isSuperAdmin),
                hasPermission,
              }),
            });
            if (plan.kind === "rejected") {
              setError({ code: "send_failed", message: plan.message });
              traceOmniSendExit({
                runId,
                layer: 2,
                stage: "useSendMessage.sendReply",
                success: false,
                error: "public_web_chat_rejected",
                conversationId: target.conversationId,
              });
              return false;
            }
            isPublicWebChat = plan.kind === "public_web_chat";
          }

          // Public Web Chat has no channel route to dispatch to — the visitor polls.
          const session = isPublicWebChat ? null : await resolveChannelSession(target.conversationId);
          const routeCheck = isPublicWebChat ? null : validateOutboundRoute(session, target);
          if (routeCheck && !routeCheck.ok) {
            setError(buildOutboundSendError(routeCheck.issue));
            markOmniSendFirstStop({
              runId,
              layer: 2,
              stage: "useSendMessage.validateOutboundRoute",
              file: "use-team-inbox-reply.ts",
              function: "validateOutboundRoute",
              line: 173,
              reason: routeCheck.issue.message,
              error: routeCheck.issue.code,
              conversationId: target.conversationId,
            });
            traceOmniSendExit({
              runId,
              layer: 2,
              stage: "useSendMessage.sendReply",
              success: false,
              error: routeCheck.issue.code,
              conversationId: target.conversationId,
            });
            return false;
          }

          optimisticId = `optimistic-${Date.now()}`;
          traceOmniSendEnter({
            runId,
            layer: 3,
            stage: "mutation.optimisticInsert",
            file: "use-team-inbox-reply.ts",
            function: "setQueryData",
            line: 178,
            conversationId: target.conversationId,
            messageId: optimisticId,
            statusBefore: null,
            statusAfter: "preparing",
          });
          queryClient.setQueryData<ConversationMessageRecord[]>(queryKey, (current) => [
            ...(current ?? []),
            buildOptimisticMessage(target, payload, profile?.id ?? null, optimisticId!, "preparing"),
          ]);
          traceOmniSendExit({
            runId,
            layer: 3,
            stage: "mutation.optimisticInsert",
            success: true,
            conversationId: target.conversationId,
            messageId: optimisticId,
            statusAfter: "preparing",
          });

          const persisted = await traceOmniSendAsync({
            runId,
            layer: 4,
            stage: "ConversationService.addMessage",
            file: "use-team-inbox-reply.ts",
            function: "conversationServices.messages.addMessage",
            line: 184,
            conversationId: target.conversationId,
            messageId: optimisticId,
            statusBefore: "preparing",
            run: () => conversationServices.messages.addMessage(conversationContext, {
            conversationId: target.conversationId,
            messageType: "outgoing",
            contentType: attachmentFields.contentType,
            content: trimmed
              || attachments.map((item) => item.name).join(", ")
              || providerAttachments.map((item) => item.filename || item.type).join(", ")
              || "Attachment",
            status: "pending",
            attachmentType: attachmentFields.attachmentType,
            attachmentUrl: attachmentFields.attachmentUrl,
            mimeType: attachmentFields.mimeType,
            fileSize: attachmentFields.fileSize,
            metadata: isPublicWebChat
              ? { ...messageMetadata, deliveryMode: PUBLIC_WEB_CHAT_DELIVERY_MODE }
              : messageMetadata,
          }),
            success: (result) => ({
              messageId: result.id,
              statusAfter: result.status,
            }),
          });

          traceOmniSendEnter({
            runId,
            layer: 3,
            stage: "mutation.replaceOptimisticId",
            file: "use-team-inbox-reply.ts",
            function: "setQueryData",
            line: 197,
            conversationId: target.conversationId,
            messageId: persisted.id,
            statusBefore: "preparing",
            statusAfter: "dispatching",
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
          traceOmniSendExit({
            runId,
            layer: 3,
            stage: "mutation.replaceOptimisticId",
            success: true,
            conversationId: target.conversationId,
            messageId: persisted.id,
            statusBefore: "preparing",
            statusAfter: "dispatching",
          });
          optimisticId = persisted.id;

          const route = routeCheck?.ok ? routeCheck.route : null;
          const dispatchResponse = !route
            ? await confirmPublicWebChatVisitorPollingReply(replyClient, persisted.id)
            : await traceOmniSendAsync({
            runId,
            layer: 6,
            stage: "CommunicationPlatform.dispatchOutboundMessage",
            file: "use-team-inbox-reply.ts",
            function: "dispatchOutboundMessage",
            line: 293,
            conversationId: target.conversationId,
            messageId: persisted.id,
            statusBefore: "dispatching",
            extra: { channelKey: route.channel_key },
            run: () => dispatchOutboundMessage(
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
                attachments: [
                  ...mapAttachmentsForDispatch(attachments),
                  ...providerAttachments,
                ],
                outboundMessageId: persisted.id,
                persistConversationMessage: false,
                metadata: {
                  source: "team_inbox",
                  conversationMessageId: persisted.id,
                  mentions: payload.mentions ?? [],
                  ...(route.channel_key === "email" && payload.emailOutbound
                    ? payload.emailOutbound
                    : {}),
                },
              },
            ),
            success: (result) => ({
              messageId: persisted.id,
              statusAfter: result.deliveryStatus,
              extra: {
                externalMessageId: result.externalMessageId ?? null,
                providerResponse: result,
              },
            }),
          });

          const confirmedStatus = mapDispatchResponseToMessageStatus(dispatchResponse.deliveryStatus);
          traceOmniSendEnter({
            runId,
            layer: 3,
            stage: "mutation.confirmDispatch",
            file: "use-team-inbox-reply.ts",
            function: "setQueryData",
            line: 327,
            conversationId: target.conversationId,
            messageId: persisted.id,
            statusBefore: "dispatching",
            statusAfter: confirmedStatus,
          });
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
          traceOmniSendExit({
            runId,
            layer: 3,
            stage: "mutation.confirmDispatch",
            success: true,
            conversationId: target.conversationId,
            messageId: persisted.id,
            statusBefore: "dispatching",
            statusAfter: confirmedStatus,
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
        } else {
          const persisted = await conversationServices.messages.addMessage(conversationContext, {
            conversationId: target.conversationId,
            messageType: "internal_note",
            contentType: attachmentFields.contentType,
            content: trimmed
              || attachments.map((item) => item.name).join(", ")
              || providerAttachments.map((item) => item.filename || item.type).join(", ")
              || "Attachment",
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

        traceOmniSendExit({
          runId,
          layer: 2,
          stage: "useSendMessage.sendReply",
          success: true,
          conversationId: target.conversationId,
          messageId: optimisticId,
        });
        return true;
      } catch (err) {
        const detail = err instanceof Error ? err.message : "send_failed";
        if (optimisticId) {
          const persistedId = optimisticId.startsWith("optimistic-") ? null : optimisticId;
          if (persistedId && payload.mode === "reply") {
            // Persist failure via security-definer RPC — PostgREST UPDATE is RLS-denied
            // (conversation_messages_update using false); otherwise rows stay preparing forever.
            try {
              const { error: confirmError } = await supabase.rpc(
                "confirm_conversation_message_outbound",
                {
                  p_message_id: persistedId,
                  p_status: "failed",
                  p_external_message_id: null,
                },
              );
              if (confirmError) {
                console.warn("[team-inbox] confirm outbound failed after send error", {
                  messageId: persistedId,
                  error: confirmError.message,
                });
              }
            } catch {
              // best-effort failure persistence
            }
            queryClient.setQueryData<ConversationMessageRecord[]>(queryKey, (current) =>
              (current ?? []).map((message) =>
                message.id === persistedId
                  ? patchOptimisticMessage(message, {
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
          } else {
            queryClient.setQueryData<ConversationMessageRecord[]>(queryKey, (current) =>
              (current ?? []).filter((message) => message.id !== optimisticId),
            );
          }
        }

        setError({
          code: payload.mode === "reply" ? "dispatch_failed" : "send_failed",
          message:
            payload.mode === "reply"
              ? "The message could not be delivered to the customer channel."
              : "The internal note could not be saved.",
          detail,
        });
        traceOmniSendExit({
          runId,
          layer: 2,
          stage: "useSendMessage.sendReply",
          success: false,
          error: detail,
          conversationId: target.conversationId,
          messageId: optimisticId,
        });
        return false;
      } finally {
        detectOmniSendStall(runId);
        setIsSending(false);
      }
    },
    [
      channelContext,
      channelPlatform.dispatcher,
      companyId,
      conversationContext,
      conversationServices.messages,
      hasPermission,
      isSending,
      isSuperAdmin,
      profile?.full_name,
      profile?.id,
      queryClient,
    ],
  );

  const clearError = useCallback(() => setError(null), []);

  return { sendReply, isSending, error, clearError };
}

export type { OutboundSendError };
