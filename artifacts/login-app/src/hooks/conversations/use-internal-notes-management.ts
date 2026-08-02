import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { useConversationServices } from "@/lib/ai-conversation";
import { appendTimelineEvent } from "@/lib/conversation-lifecycle";
import { persistLifecycleMetadata } from "@/lib/conversation-lifecycle/adapters/backend-action-executor";
import { conversationMessagesQueryKey } from "@/hooks/conversations/use-conversation-messages";
import {
  applyInternalNotesOverlay,
  buildDeletedNoteOverlay,
  buildEditedNoteOverlay,
  readInternalNotesOverlay,
  writeInternalNotesOverlay,
} from "@/lib/omnichannel/services/internal-notes-overlay";
import {
  buildInternalNoteDeletedAuditSummary,
  buildInternalNoteEditedAuditSummary,
} from "@/lib/omnichannel/services/lifecycle-audit-summaries";
import type { UnifiedMessage } from "@/lib/omnichannel/types/unified-conversation";

type Actor = {
  id: string | null;
  label: string | null;
};

export function useInternalNotesManagement(companyId: string | null) {
  const queryClient = useQueryClient();
  const { services, context } = useConversationServices();

  const invalidate = useCallback(
    async (conversationId: string) => {
      await queryClient.invalidateQueries({ queryKey: conversationMessagesQueryKey(conversationId) });
      await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
    },
    [companyId, queryClient],
  );

  const editNote = useMutation({
    mutationFn: async (input: {
      record: ConversationRecord;
      messageId: string;
      originalBody: string;
      nextBody: string;
      actor: Actor;
    }) => {
      const trimmed = input.nextBody.trim();
      if (!trimmed) throw new Error("Note cannot be empty");

      const overlay = readInternalNotesOverlay(input.record.metadata);
      const nextOverlay = buildEditedNoteOverlay(
        overlay,
        input.messageId,
        input.originalBody,
        trimmed,
        input.actor,
      );

      let metadata = writeInternalNotesOverlay(input.record.metadata, nextOverlay);
      metadata = appendTimelineEvent(metadata, {
        conversationId: input.record.id,
        type: "internal_note",
        timestamp: new Date().toISOString(),
        actorId: input.actor.id,
        actorLabel: input.actor.label,
        summary: buildInternalNoteEditedAuditSummary(input.actor.label),
        payload: {
          messageId: input.messageId,
          action: "edited",
        },
      });

      await persistLifecycleMetadata(services, context, input.record.id, metadata);
    },
    onSuccess: (_, variables) => invalidate(variables.record.id),
  });

  const deleteNote = useMutation({
    mutationFn: async (input: {
      record: ConversationRecord;
      messageId: string;
      actor: Actor;
    }) => {
      const overlay = readInternalNotesOverlay(input.record.metadata);
      const nextOverlay = buildDeletedNoteOverlay(overlay, input.messageId);

      let metadata = writeInternalNotesOverlay(input.record.metadata, nextOverlay);
      metadata = appendTimelineEvent(metadata, {
        conversationId: input.record.id,
        type: "internal_note",
        timestamp: new Date().toISOString(),
        actorId: input.actor.id,
        actorLabel: input.actor.label,
        summary: buildInternalNoteDeletedAuditSummary(input.actor.label),
        payload: {
          messageId: input.messageId,
          action: "deleted",
        },
      });

      await persistLifecycleMetadata(services, context, input.record.id, metadata);
    },
    onSuccess: (_, variables) => invalidate(variables.record.id),
  });

  return {
    editNote: editNote.mutateAsync,
    deleteNote: deleteNote.mutateAsync,
    isPending: editNote.isPending || deleteNote.isPending,
    error: editNote.error ?? deleteNote.error,
  };
}

export function mergeInternalNotesForDisplay(
  notes: UnifiedMessage[],
  metadata: Record<string, unknown> | null | undefined,
): UnifiedMessage[] {
  return applyInternalNotesOverlay(notes, readInternalNotesOverlay(metadata));
}
