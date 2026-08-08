import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import type {
  EntityAttachment,
  EntityNote,
  EntityNoteMention,
  EntityNoteVisibility,
  EntityTimelineEvent,
  EntityWorkspaceModuleId,
} from "@/lib/entity-workspace";
import { compareEntityNotesNewestFirst } from "@/lib/entity-workspace/services/note-meta";
import type { Customer } from "@/lib/types";
import {
  entityWorkspaceBundleKey,
  useEntityWorkspaceBundle,
  type EntityRelatedCounts,
  type EntityWorkspaceBundle,
  type EntityWorkspaceCustomField,
  type EntityWorkspaceTag,
  type EntityWorkspaceTask,
} from "@/hooks/entity-workspace/use-entity-workspace-bundle";
import { useEntityWorkspaceServices } from "@/hooks/entity-workspace/use-entity-workspace-services";
import type { WhatsappConversationRef } from "@/lib/customer-profile/services";

export type EntityWorkspacePermissions = EntityWorkspaceBundle["permissions"];

export type EntityCommunicationChannel = "call" | "whatsapp" | "email";

export type EntityWorkspaceContextValue = {
  entityType: string;
  entityId: string;
  operationId: string | null;
  companyId: string;
  customer: Customer | null;
  operation: OperationsRow | null;
  notes: EntityNote[];
  files: EntityAttachment[];
  timeline: EntityTimelineEvent[];
  tags: EntityWorkspaceTag[];
  customFields: EntityWorkspaceCustomField[];
  tasks: EntityWorkspaceTask[];
  related: EntityRelatedCounts;
  whatsapp: WhatsappConversationRef | null;
  permissions: EntityWorkspacePermissions;
  currentUser: { id: string; displayName: string | null };
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  createNote: (input: {
    text: string;
    title?: string | null;
    visibility?: EntityNoteVisibility;
    sourceModule: EntityWorkspaceModuleId;
    category?: string | null;
    pinned?: boolean;
    mentions?: EntityNoteMention[];
    files?: File[];
    uploadedFiles?: {
      storagePath: string;
      mimeType: string;
      fileName: string;
      sizeBytes: number;
    }[];
    onUploadProgress?: (event: {
      fileName: string;
      percent: number;
      fileIndex: number;
      fileCount: number;
    }) => void;
  }) => Promise<EntityNote>;
  setNotePinned: (noteId: string, pinned: boolean) => Promise<void>;
  /** Writes entity_activities communication event + optimistic timeline. */
  recordCommunication: (channel: EntityCommunicationChannel) => Promise<void>;
  focusNoteId: string | null;
  setFocusNoteId: (noteId: string | null) => void;
  highlightedNoteId: string | null;
};

const EntityWorkspaceContext = createContext<EntityWorkspaceContextValue | null>(null);

function invalidateSharedEntityCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  entityType: string,
  entityId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["entity-workspace", "notes", entityType, entityId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["entity-workspace", "timeline", entityType, entityId],
  });
  void queryClient.invalidateQueries({ queryKey: ["entity-workspace", "bundle"] });
  void queryClient.invalidateQueries({ queryKey: ["customer-timeline"] });
  void queryClient.invalidateQueries({ queryKey: ["customer360-workspace"] });
}

export function EntityWorkspaceProvider({
  entityType,
  entityId,
  operationId = null,
  templateKey = "clinic",
  children,
}: {
  entityType: string;
  entityId: string;
  operationId?: string | null;
  templateKey?: string;
  children: ReactNode;
}) {
  const services = useEntityWorkspaceServices();
  const queryClient = useQueryClient();
  const bundleQuery = useEntityWorkspaceBundle({ entityType, entityId, operationId, templateKey });
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);

  const createNote = useCallback(
    async (input: {
      text: string;
      title?: string | null;
      visibility?: EntityNoteVisibility;
      sourceModule: EntityWorkspaceModuleId;
      category?: string | null;
      pinned?: boolean;
      mentions?: EntityNoteMention[];
      files?: File[];
      uploadedFiles?: {
        storagePath: string;
        mimeType: string;
        fileName: string;
        sizeBytes: number;
      }[];
      onUploadProgress?: (event: {
        fileName: string;
        percent: number;
        fileIndex: number;
        fileCount: number;
      }) => void;
    }) => {
      if (!services || !bundleQuery.data) throw new Error("Workspace unavailable");
      const note = await services.notes.create({
        tenantId: services.ctx.companyId,
        entityType,
        entityId,
        text: input.text,
        title: input.title,
        visibility: input.visibility,
        operationId,
        createdBy: services.ctx.actorUserId,
        createdByName: services.displayName,
        category: input.category,
        sourceModule: input.sourceModule,
        pinned: input.pinned,
        mentions: input.mentions,
        files: input.files,
        uploadedFiles: input.uploadedFiles,
        onUploadProgress: input.onUploadProgress,
      });

      const key = entityWorkspaceBundleKey(
        bundleQuery.data.companyId,
        entityType,
        entityId,
        operationId,
      );

      queryClient.setQueryData<EntityWorkspaceBundle>(key, (prev) => {
        if (!prev) return prev;
        const attachmentCount = note.attachments.length;
        const actor = note.createdByName ?? note.createdBy ?? "Someone";
        const timelineEvent: EntityTimelineEvent = {
          id: `note:${note.id}`,
          entityId: note.entityId,
          entityType: note.entityType,
          eventType: "note_added",
          title:
            attachmentCount > 0
              ? "Note created"
              : `${actor} added a note`,
          description: note.title?.trim() || note.text.slice(0, 120) || null,
          actor: note.createdByName ?? note.createdBy,
          actorId: note.createdBy,
          role: note.createdByRole,
          department: note.department,
          timestamp: note.createdAt,
          sourceModule: note.sourceModule,
          operationId: note.operationId,
          noteId: note.id,
          attachmentCount,
        };
        const newFiles = note.attachments.map((attachment) => ({
          id: attachment.id,
          entityId: note.entityId,
          entityType: note.entityType,
          activityId: note.id,
          operationId: note.operationId,
          category: null,
          fileType: attachment.fileType,
          fileName: attachment.fileName,
          uploadedBy: note.createdByName,
          uploadedByRole: note.createdByRole,
          uploadedAt: attachment.uploadedAt || note.createdAt,
          storagePath: "",
          preview: attachment.preview,
          sizeBytes: attachment.sizeBytes,
          sourceModule: note.sourceModule,
        }));
        return {
          ...prev,
          notes: [note, ...prev.notes].sort(compareEntityNotesNewestFirst),
          files: [...newFiles, ...prev.files],
          timeline: [timelineEvent, ...prev.timeline],
          related: {
            ...prev.related,
            notes: prev.related.notes + 1,
            files: prev.related.files + newFiles.length,
          },
        };
      });

      setHighlightedNoteId(note.id);
      window.setTimeout(() => {
        setHighlightedNoteId((current) => (current === note.id ? null : current));
      }, 3200);

      invalidateSharedEntityCaches(queryClient, entityType, entityId);
      return note;
    },
    [bundleQuery.data, entityId, entityType, operationId, queryClient, services],
  );

  const setNotePinned = useCallback(
    async (noteId: string, pinned: boolean) => {
      if (!services || !bundleQuery.data) throw new Error("Workspace unavailable");
      const key = entityWorkspaceBundleKey(
        bundleQuery.data.companyId,
        entityType,
        entityId,
        operationId,
      );

      queryClient.setQueryData<EntityWorkspaceBundle>(key, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes
            .map((note) => (note.id === noteId ? { ...note, pinned } : note))
            .sort(compareEntityNotesNewestFirst),
        };
      });

      try {
        const updated = await services.notes.setPinned(noteId, pinned);
        queryClient.setQueryData<EntityWorkspaceBundle>(key, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            notes: prev.notes
              .map((note) => (note.id === noteId ? updated : note))
              .sort(compareEntityNotesNewestFirst),
          };
        });
        invalidateSharedEntityCaches(queryClient, entityType, entityId);
      } catch (error) {
        void bundleQuery.refetch();
        throw error;
      }
    },
    [bundleQuery, entityId, entityType, operationId, queryClient, services],
  );

  const recordCommunication = useCallback(
    async (channel: EntityCommunicationChannel) => {
      if (!services || !bundleQuery.data) return;

      const labels: Record<EntityCommunicationChannel, string> = {
        call: "Call initiated",
        whatsapp: "WhatsApp conversation opened",
        email: "Email opened",
      };

      try {
        const activity = await services.activities.create({
          tenantId: services.ctx.companyId,
          entityType,
          entityId,
          activityType: channel,
          subject: labels[channel],
          body: labels[channel],
          actorId: services.ctx.actorUserId,
          actorName: services.displayName ?? undefined,
          relatedEntityType: operationId ? "booking" : undefined,
          relatedEntityId: operationId ?? undefined,
          attachments: [{ sourceModule: "operations" }],
          actorUserId: services.ctx.actorUserId,
        });

        const key = entityWorkspaceBundleKey(
          bundleQuery.data.companyId,
          entityType,
          entityId,
          operationId,
        );

        queryClient.setQueryData<EntityWorkspaceBundle>(key, (prev) => {
          if (!prev) return prev;
          const timelineEvent: EntityTimelineEvent = {
            id: `activity:${activity.id}`,
            entityId,
            entityType,
            eventType: "communication_sent",
            title: activity.subject,
            description: activity.body,
            actor: activity.actorName ?? activity.actorId,
            role: null,
            department: null,
            timestamp: activity.occurredAt,
            sourceModule: "operations",
            operationId: operationId ?? null,
          };
          return {
            ...prev,
            timeline: [timelineEvent, ...prev.timeline],
          };
        });

        invalidateSharedEntityCaches(queryClient, entityType, entityId);
      } catch {
        // Communication destination already opened — timeline write is best-effort.
      }
    },
    [bundleQuery.data, entityId, entityType, operationId, queryClient, services],
  );

  const value = useMemo<EntityWorkspaceContextValue>(() => {
    const data = bundleQuery.data;
    return {
      entityType,
      entityId,
      operationId: operationId ?? null,
      companyId: data?.companyId ?? "",
      customer: data?.customer ?? null,
      operation: data?.operation ?? null,
      notes: data?.notes ?? [],
      files: data?.files ?? [],
      timeline: data?.timeline ?? [],
      tags: data?.tags ?? [],
      customFields: data?.customFields ?? [],
      tasks: data?.tasks ?? [],
      related: data?.related ?? {
        notes: 0,
        files: 0,
        invoices: 0,
        bookings: 0,
        messages: 0,
        tasks: 0,
      },
      whatsapp: data?.whatsapp ?? null,
      permissions: data?.permissions ?? {
        canCollectPayment: false,
        canReadTasks: false,
        canReadInvoices: false,
        canCreateNotes: false,
        canCall: false,
        canWhatsapp: false,
      },
      currentUser: {
        id: services?.ctx.actorUserId ?? "",
        displayName: services?.displayName ?? null,
      },
      isLoading: bundleQuery.isLoading || bundleQuery.isPending,
      isError: bundleQuery.isError,
      error: bundleQuery.error instanceof Error ? bundleQuery.error : null,
      refetch: () => {
        void bundleQuery.refetch();
      },
      createNote,
      setNotePinned,
      recordCommunication,
      focusNoteId,
      setFocusNoteId,
      highlightedNoteId,
    };
  }, [
    bundleQuery.data,
    bundleQuery.error,
    bundleQuery.isError,
    bundleQuery.isLoading,
    bundleQuery.isPending,
    bundleQuery.refetch,
    createNote,
    entityId,
    entityType,
    focusNoteId,
    highlightedNoteId,
    operationId,
    recordCommunication,
    services,
    setNotePinned,
  ]);

  return (
    <EntityWorkspaceContext.Provider value={value}>{children}</EntityWorkspaceContext.Provider>
  );
}

export function useEntityWorkspace(): EntityWorkspaceContextValue {
  const ctx = useContext(EntityWorkspaceContext);
  if (!ctx) {
    throw new Error("useEntityWorkspace must be used within EntityWorkspaceProvider");
  }
  return ctx;
}

export function useEntityWorkspaceOptional(): EntityWorkspaceContextValue | null {
  return useContext(EntityWorkspaceContext);
}
