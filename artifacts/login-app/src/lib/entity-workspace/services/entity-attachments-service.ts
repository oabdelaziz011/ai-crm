import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import {
  createLoginAppEntityFileReadPort,
  createLoginAppEntityFileWritePort,
} from "@/lib/application-layer/adapters/entity-port-adapters";
import { supabase } from "@/lib/supabase";
import type { EntityAttachment, EntityWorkspaceModuleId } from "../types";
import { createEntityFileSignedUrl } from "./entity-file-upload";

const ATTACHMENT_META_KEY = "entity_attachment_meta";

function mapAttachment(row: {
  id: string;
  entityId: string;
  entityType: string;
  activityId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string | null;
  storagePath: string;
  previewUrl: string | null;
  uploadedAt: string;
  previewMetadata: Readonly<Record<string, unknown>>;
}): EntityAttachment {
  const meta = (row.previewMetadata?.[ATTACHMENT_META_KEY] ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    entityId: row.entityId,
    entityType: row.entityType,
    activityId: row.activityId ?? (meta.activityId == null ? null : String(meta.activityId)),
    operationId: meta.operationId == null ? null : String(meta.operationId),
    category: row.category,
    fileType: row.mimeType,
    fileName: row.fileName,
    uploadedBy: meta.uploadedBy == null ? null : String(meta.uploadedBy),
    uploadedByRole: meta.uploadedByRole == null ? null : String(meta.uploadedByRole),
    uploadedAt: row.uploadedAt,
    storagePath: row.storagePath,
    preview: row.previewUrl,
    sizeBytes: row.sizeBytes,
    sourceModule: meta.sourceModule == null ? null : String(meta.sourceModule),
  };
}

/**
 * ONE shared Attachments service for CRM + Operations.
 * Backed by `entity_files` — no duplicated file tables.
 */
export function createEntityAttachmentsService(
  ctx: LoginAppPortContext,
  client: SupabaseClient = supabase,
) {
  const read = createLoginAppEntityFileReadPort(client, ctx);
  const write = createLoginAppEntityFileWritePort(client, ctx);

  return Object.freeze({
    async list(entityType: string, entityId: string): Promise<EntityAttachment[]> {
      const rows = await read.list(ctx.companyId, entityType, entityId, { limit: 200 });
      return rows
        .map((row) => mapAttachment(row))
        .sort((a, b) => {
          if (a.uploadedAt === b.uploadedAt) return b.id.localeCompare(a.id);
          return a.uploadedAt < b.uploadedAt ? 1 : -1;
        });
    },

    async create(input: {
      tenantId: string;
      entityType: string;
      entityId: string;
      activityId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storagePath: string;
      category?: string | null;
      operationId?: string | null;
      uploadedBy: string;
      uploadedByRole?: string | null;
      sourceModule: EntityWorkspaceModuleId | string;
      previewMetadata?: Record<string, unknown>;
    }): Promise<EntityAttachment> {
      const previewMetadata = {
        ...(input.previewMetadata ?? {}),
        [ATTACHMENT_META_KEY]: {
          activityId: input.activityId,
          operationId: input.operationId ?? null,
          uploadedBy: input.uploadedBy,
          uploadedByRole: input.uploadedByRole ?? null,
          sourceModule: input.sourceModule,
        },
      };

      const row = await write.create({
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        activityId: input.activityId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        category: input.category ?? undefined,
        storagePath: input.storagePath,
        previewMetadata,
        actorUserId: input.uploadedBy,
      });

      const signedUrl = await createEntityFileSignedUrl(input.storagePath);

      return mapAttachment({
        ...row,
        previewUrl: signedUrl ?? row.previewUrl,
      });
    },
  });
}

export type EntityAttachmentsService = ReturnType<typeof createEntityAttachmentsService>;
