import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntityNoteCreateInput, EntityWorkspaceModuleId } from "@/lib/entity-workspace";
import { useEntityWorkspaceServices } from "./use-entity-workspace-services";

export function entityNotesQueryKey(entityType: string, entityId: string) {
  return ["entity-workspace", "notes", entityType, entityId] as const;
}

export function useEntityNotes(entityType: string, entityId: string) {
  const services = useEntityWorkspaceServices();

  return useQuery({
    queryKey: entityNotesQueryKey(entityType, entityId),
    enabled: Boolean(services && entityType && entityId),
    queryFn: () => services!.notes.list(entityType, entityId, { moduleId: "crm" }),
  });
}

export function useCreateEntityNote(entityType: string, entityId: string) {
  const services = useEntityWorkspaceServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      text: string;
      title?: string | null;
      operationId?: string | null;
      sourceModule: EntityWorkspaceModuleId;
      category?: string | null;
      visibility?: EntityNoteCreateInput["visibility"];
      createdByRole?: string | null;
      department?: string | null;
      pinned?: boolean;
      mentions?: EntityNoteCreateInput["mentions"];
      files?: File[];
      uploadedFiles?: {
        storagePath: string;
        mimeType: string;
        fileName: string;
        sizeBytes: number;
      }[];
      onUploadProgress?: EntityNoteCreateInput["onUploadProgress"];
    }) => {
      if (!services) throw new Error("Workspace services unavailable");
      return services.notes.create({
        tenantId: services.ctx.companyId,
        entityType,
        entityId,
        text: input.text,
        title: input.title,
        operationId: input.operationId,
        createdBy: services.ctx.actorUserId,
        createdByName: services.displayName,
        createdByRole: input.createdByRole,
        department: input.department,
        visibility: input.visibility,
        category: input.category,
        sourceModule: input.sourceModule,
        pinned: input.pinned,
        mentions: input.mentions,
        files: input.files,
        uploadedFiles: input.uploadedFiles,
        onUploadProgress: input.onUploadProgress,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entityNotesQueryKey(entityType, entityId) });
      await queryClient.invalidateQueries({
        queryKey: ["entity-workspace", "timeline", entityType, entityId],
      });
      await queryClient.invalidateQueries({ queryKey: ["entity-workspace", "bundle"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["customer360-workspace"] });
    },
  });
}

export function useSetEntityNotePinned(entityType: string, entityId: string) {
  const services = useEntityWorkspaceServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { noteId: string; pinned: boolean }) => {
      if (!services) throw new Error("Workspace services unavailable");
      return services.notes.setPinned(input.noteId, input.pinned);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entityNotesQueryKey(entityType, entityId) });
      await queryClient.invalidateQueries({ queryKey: ["entity-workspace", "bundle"] });
    },
  });
}
