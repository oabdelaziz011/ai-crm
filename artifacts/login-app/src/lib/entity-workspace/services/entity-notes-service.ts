import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import {
  createLoginAppEntityActivityReadPort,
  createLoginAppEntityActivityWritePort,
} from "@/lib/application-layer/adapters/entity-port-adapters";
import { supabase } from "@/lib/supabase";
import type {
  EntityAttachment,
  EntityNote,
  EntityNoteAttachmentRef,
  EntityNoteCreateInput,
  EntityWorkspaceModuleId,
} from "../types";
import {
  compareEntityNotesNewestFirst,
  decodeNoteMeta,
  encodeNoteMeta,
  noteVisibleInModule,
  normalizeNoteVisibility,
  patchNoteMetaAttachments,
} from "./note-meta";
import { createEntityAttachmentsService } from "./entity-attachments-service";
import {
  removeEntityFileObject,
  uploadEntityNoteFile,
  validateEntityNoteFiles,
} from "./entity-file-upload";

function toNoteAttachmentRefs(files: EntityAttachment[], activityId: string): EntityNoteAttachmentRef[] {
  return files
    .filter((file) => file.activityId === activityId)
    .sort((a, b) => {
      if (a.uploadedAt === b.uploadedAt) return b.id.localeCompare(a.id);
      return a.uploadedAt < b.uploadedAt ? 1 : -1;
    })
    .map((file) => ({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      preview: file.preview,
      sizeBytes: file.sizeBytes,
      uploadedAt: file.uploadedAt,
    }));
}

function mapNoteRow(
  row: {
    id: string;
    entityId: string;
    entityType: string;
    relatedEntityId: string | null;
    actorId: string | null;
    actorName: string | null;
    subject: string;
    body: string | null;
    attachments: readonly Readonly<Record<string, unknown>>[];
    occurredAt: string;
  },
  files: EntityAttachment[],
): EntityNote {
  const meta = decodeNoteMeta(row.attachments);
  const title = meta?.title?.trim() || null;
  const text = row.body?.trim() || row.subject;
  return {
    id: row.id,
    entityId: row.entityId,
    entityType: row.entityType,
    operationId: meta?.operationId ?? row.relatedEntityId,
    createdBy: row.actorId,
    createdByName: row.actorName,
    createdByRole: meta?.createdByRole ?? null,
    department: meta?.department ?? null,
    visibility: normalizeNoteVisibility(meta?.visibility),
    category: meta?.category ?? null,
    title,
    text,
    sourceModule: meta?.sourceModule ?? null,
    pinned: Boolean(meta?.pinned),
    mentions: meta?.mentions ?? [],
    attachments: toNoteAttachmentRefs(files, row.id),
    createdAt: row.occurredAt,
    updatedAt: row.occurredAt,
  };
}

/**
 * ONE shared Notes service for CRM + Operations.
 * Backed by `entity_activities` (`manual_note`) — attachments via entity_files.activity_id.
 */
export function createEntityNotesService(
  ctx: LoginAppPortContext,
  client: SupabaseClient = supabase,
) {
  const read = createLoginAppEntityActivityReadPort(client, ctx);
  const write = createLoginAppEntityActivityWritePort(client, ctx);
  const attachments = createEntityAttachmentsService(ctx, client);

  async function softDeleteNote(noteId: string, actorUserId: string): Promise<void> {
    await client
      .from("entity_activities")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("tenant_id", ctx.companyId)
      .eq("id", noteId);
  }

  return Object.freeze({
    async list(
      entityType: string,
      entityId: string,
      options?: { moduleId?: EntityWorkspaceModuleId | string; files?: EntityAttachment[] },
    ): Promise<EntityNote[]> {
      const [rows, files] = await Promise.all([
        read.list(ctx.companyId, entityType, entityId, { limit: 200 }),
        options?.files
          ? Promise.resolve(options.files)
          : attachments.list(entityType, entityId),
      ]);

      return rows
        .filter((row) => row.activityType === "manual_note")
        .map((row) => mapNoteRow(row, files))
        .filter((note) =>
          options?.moduleId ? noteVisibleInModule(note.visibility, options.moduleId) : true,
        )
        .sort(compareEntityNotesNewestFirst);
    },

    async setPinned(noteId: string, pinned: boolean): Promise<EntityNote> {
      const { data, error } = await client
        .from("entity_activities")
        .select(
          "id, tenant_id, entity_type, entity_id, related_entity_id, actor_id, actor_name, subject, body, attachments, occurred_at",
        )
        .eq("tenant_id", ctx.companyId)
        .eq("id", noteId)
        .eq("activity_type", "manual_note")
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Note not found");

      const nextAttachments = patchNoteMetaAttachments(
        (data.attachments as Readonly<Record<string, unknown>>[] | null) ?? [],
        { pinned },
      );

      const { error: updateError } = await client
        .from("entity_activities")
        .update({
          attachments: nextAttachments,
          updated_by: ctx.actorUserId,
        })
        .eq("tenant_id", ctx.companyId)
        .eq("id", noteId);

      if (updateError) throw new Error(updateError.message);

      const files = await attachments.list(String(data.entity_type), String(data.entity_id));
      return mapNoteRow(
        {
          id: String(data.id),
          entityId: String(data.entity_id),
          entityType: String(data.entity_type),
          relatedEntityId: data.related_entity_id ? String(data.related_entity_id) : null,
          actorId: data.actor_id ? String(data.actor_id) : null,
          actorName: data.actor_name ? String(data.actor_name) : null,
          subject: String(data.subject),
          body: data.body ? String(data.body) : null,
          attachments: nextAttachments,
          occurredAt: String(data.occurred_at),
        },
        files,
      );
    },

    /**
     * Production save flow:
     * 1) Create note (entity_activities)
     * 2) Upload each file to Storage
     * 3) Create entity_files linked by activity_id
     * On failure: remove storage objects, archive any file rows, soft-delete the note.
     */
    async create(input: EntityNoteCreateInput): Promise<EntityNote> {
      const text = input.text.trim();
      if (!text) throw new Error("Note text is required");

      const liveFiles = [...(input.files ?? [])];
      const staged = [...(input.uploadedFiles ?? [])];

      if (liveFiles.length > 0) {
        const validation = validateEntityNoteFiles(liveFiles);
        if (!validation.ok) throw new Error(validation.message);
      }

      const title = input.title?.trim() || null;
      const visibility = normalizeNoteVisibility(input.visibility ?? "both");
      const meta = encodeNoteMeta({
        operationId: input.operationId ?? null,
        createdByRole: input.createdByRole ?? null,
        department: input.department ?? null,
        visibility,
        category: input.category ?? null,
        title,
        sourceModule: input.sourceModule,
        pinned: Boolean(input.pinned),
        mentions: input.mentions ?? [],
      });

      const row = await write.create({
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        activityType: "manual_note",
        subject: (title || text).slice(0, 120),
        body: text,
        actorId: input.createdBy,
        actorName: input.createdByName ?? undefined,
        relatedEntityType: input.operationId ? "booking" : undefined,
        relatedEntityId: input.operationId ?? undefined,
        attachments: [meta],
        actorUserId: input.createdBy,
      });

      const uploaded: EntityAttachment[] = [];
      const storagePaths: string[] = [];
      const createdFileIds: string[] = [];
      const fileCount = staged.length + liveFiles.length;

      try {
        // Prefer staged binaries only when they already exist in Storage (legacy path).
        for (let index = 0; index < staged.length; index += 1) {
          const binary = staged[index]!;
          input.onUploadProgress?.({
            fileName: binary.fileName,
            percent: 100,
            fileIndex: index,
            fileCount,
          });
          const attachment = await attachments.create({
            tenantId: input.tenantId,
            entityType: input.entityType,
            entityId: input.entityId,
            activityId: row.id,
            fileName: binary.fileName,
            mimeType: binary.mimeType,
            sizeBytes: binary.sizeBytes,
            storagePath: binary.storagePath,
            operationId: input.operationId,
            uploadedBy: input.createdBy,
            uploadedByRole: input.createdByRole,
            sourceModule: input.sourceModule,
          });
          createdFileIds.push(attachment.id);
          storagePaths.push(binary.storagePath);
          uploaded.push(attachment);
        }

        for (let index = 0; index < liveFiles.length; index += 1) {
          const file = liveFiles[index]!;
          const fileIndex = staged.length + index;
          const uploadedBinary = await uploadEntityNoteFile({
            tenantId: input.tenantId,
            entityType: input.entityType,
            entityId: input.entityId,
            activityId: row.id,
            file,
            onProgress: (percent) => {
              input.onUploadProgress?.({
                fileName: file.name,
                percent,
                fileIndex,
                fileCount,
              });
            },
          });
          storagePaths.push(uploadedBinary.storagePath);

          try {
            const attachment = await attachments.create({
              tenantId: input.tenantId,
              entityType: input.entityType,
              entityId: input.entityId,
              activityId: row.id,
              fileName: uploadedBinary.fileName,
              mimeType: uploadedBinary.mimeType,
              sizeBytes: uploadedBinary.sizeBytes,
              storagePath: uploadedBinary.storagePath,
              operationId: input.operationId,
              uploadedBy: input.createdBy,
              uploadedByRole: input.createdByRole,
              sourceModule: input.sourceModule,
            });
            createdFileIds.push(attachment.id);
            uploaded.push(attachment);
          } catch (metaError) {
            // Never leave Storage without metadata — remove the binary first.
            await removeEntityFileObject(uploadedBinary.storagePath).catch(() => undefined);
            storagePaths.pop();
            throw metaError;
          }
        }

        return mapNoteRow(row, uploaded);
      } catch (error) {
        for (const fileId of createdFileIds) {
          try {
            await client
              .from("entity_files")
              .update({
                deleted_at: new Date().toISOString(),
                updated_by: input.createdBy,
              })
              .eq("tenant_id", input.tenantId)
              .eq("id", fileId);
          } catch {
            /* best-effort rollback */
          }
        }
        for (const path of storagePaths) {
          try {
            await removeEntityFileObject(path);
          } catch {
            /* best-effort rollback */
          }
        }
        try {
          await softDeleteNote(row.id, input.createdBy);
        } catch {
          /* best-effort rollback */
        }

        if (error instanceof Error) throw error;
        throw new Error("Could not save note attachments");
      }
    },
  });
}

export type EntityNotesService = ReturnType<typeof createEntityNotesService>;
