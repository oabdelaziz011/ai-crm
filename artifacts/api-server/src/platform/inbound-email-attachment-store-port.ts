import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONVERSATION_ATTACHMENTS_BUCKET,
  resolveInboundAttachmentKind,
  sanitizeInboundAttachmentFilename,
  type InboundAttachmentStorePort,
} from "@workspace/channel-platform";

/**
 * Service-role upload of inbound email files into conversation-attachments.
 * Path format matches composer uploads: {companyId}/{conversationId}/{uuid}-{filename}.
 */
export function createSupabaseInboundAttachmentStorePort(
  client: SupabaseClient,
): InboundAttachmentStorePort {
  return {
    async store(input) {
      const companyId = input.companyId.trim();
      const conversationId = input.conversationId.trim();
      const filename = sanitizeInboundAttachmentFilename(input.filename);
      const id = randomUUID();
      const storagePath = `${companyId}/${conversationId}/${id}-${filename}`;
      const mimeType = input.mimeType.trim() || "application/octet-stream";

      const { error } = await client.storage.from(CONVERSATION_ATTACHMENTS_BUCKET).upload(storagePath, input.content, {
        cacheControl: "3600",
        upsert: false,
        contentType: mimeType,
      });
      if (error) throw error;

      return {
        id,
        name: filename,
        storagePath,
        mimeType,
        fileSize: input.content.length,
        kind: resolveInboundAttachmentKind(filename, mimeType),
      };
    },
  };
}
