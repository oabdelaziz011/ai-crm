import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityFileWritePort, FileWritePort, FileReadModel } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

/** Delegates universal file uploads to entity_files via EntityFileWritePort. */
export function createLoginAppFileWritePort(
  entityFileWrite: EntityFileWritePort,
  ctx: LoginAppPortContext,
): FileWritePort {
  return {
    async upload(input): Promise<FileReadModel> {
      if (input.tenantId !== ctx.companyId) throw new Error("Permission denied");
      if (!input.entityType || !input.entityId) {
        throw new Error("entityType and entityId are required for file uploads");
      }

      const storagePath = `${input.tenantId}/${input.entityType}/${input.entityId}/${Date.now()}_${input.fileName}`;

      const file = await entityFileWrite.create({
        tenantId: input.tenantId,
        actorUserId: ctx.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storagePath,
      });

      return Object.freeze({
        id: file.id,
        fileName: file.fileName,
        uploadedAt: file.uploadedAt,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        previewUrl: file.previewUrl ?? null,
      });
    },
  };
}
