import { supabase } from "@/lib/supabase";
import type {
  ComposerAttachmentKind,
  ComposerPendingAttachment,
  ComposerUploadedAttachment,
} from "@/lib/omnichannel/types/composer-enterprise-types";
import { COMPOSER_MAX_ATTACHMENTS } from "@/lib/omnichannel/types/composer-enterprise-types";
import {
  CONVERSATION_ATTACHMENTS_BUCKET,
  getConversationAttachmentSignedUrlSeconds,
  resolveConversationAttachmentUrl as resolveSharedConversationAttachmentUrl,
  type ServiceContext,
} from "@workspace/channel-platform/client";

const BUCKET = CONVERSATION_ATTACHMENTS_BUCKET;

const ALLOWED_MIME: Record<string, ComposerAttachmentKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
};

export function resolveAttachmentKind(file: File): ComposerAttachmentKind | null {
  const mime = file.type.toLowerCase();
  if (ALLOWED_MIME[mime]) return ALLOWED_MIME[mime];
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "txt") return "txt";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export function validateComposerFiles(files: File[]): { ok: true; files: File[] } | { ok: false; reason: string } {
  if (files.length === 0) return { ok: true, files: [] };
  if (files.length > COMPOSER_MAX_ATTACHMENTS) {
    return { ok: false, reason: "too_many" };
  }
  for (const file of files) {
    if (!resolveAttachmentKind(file)) return { ok: false, reason: "unsupported_type" };
    if (file.size > 25 * 1024 * 1024) return { ok: false, reason: "too_large" };
  }
  return { ok: true, files };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+\s]/g, "_").slice(0, 120);
}

/**
 * Authoritative conversation ownership check before building a storage path.
 * Does not trust client companyId/conversationId alone — verifies the live row.
 * Storage RLS (migration 347) remains the enforcement boundary for PostgREST.
 */
export async function assertConversationAttachmentUploadTarget(input: {
  companyId: string;
  conversationId: string;
}): Promise<void> {
  const companyId = input.companyId?.trim();
  const conversationId = input.conversationId?.trim();
  if (!companyId || !conversationId) {
    throw new Error("Conversation context required for attachment upload.");
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id, company_id, deleted_at")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error("Conversation not found or not accessible for attachment upload.");
  }
  if (String(data.company_id) !== companyId) {
    throw new Error("Conversation does not belong to the active company.");
  }
}

function createBrowserAttachmentAuthz() {
  return {
    async loadLiveConversation(conversationId: string) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, company_id")
        .eq("id", conversationId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.id || !data.company_id) return null;
      return { id: String(data.id), companyId: String(data.company_id) };
    },
    async createSignedUrl(storagePath: string, expiresInSeconds: number) {
      // User JWT → H2 storage SELECT policy (ai.conversations.view) applies naturally.
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);
      if (error) throw new Error(error.message);
      if (!data?.signedUrl) throw new Error("Failed to sign conversation attachment URL.");
      return data.signedUrl;
    },
  };
}

/**
 * H3: mint an ephemeral signed URL after authorization.
 * Prefer user JWT so migration 347 storage RLS applies.
 */
export async function resolveConversationAttachmentUrl(input: {
  companyId: string;
  conversationId: string;
  storagePath: string;
  ctx: ServiceContext;
  expiresInSeconds?: number;
}): Promise<string> {
  return resolveSharedConversationAttachmentUrl({
    companyId: input.companyId,
    conversationId: input.conversationId,
    storagePath: input.storagePath,
    ctx: input.ctx,
    authz: createBrowserAttachmentAuthz(),
    expiresInSeconds: input.expiresInSeconds ?? getConversationAttachmentSignedUrlSeconds(),
  });
}

export async function uploadConversationAttachment(input: {
  companyId: string;
  conversationId: string;
  file: File;
  onProgress?: (progress: number) => void;
}): Promise<ComposerUploadedAttachment> {
  const kind = resolveAttachmentKind(input.file);
  if (!kind) throw new Error("Unsupported attachment type");

  await assertConversationAttachmentUploadTarget({
    companyId: input.companyId,
    conversationId: input.conversationId,
  });

  const attachmentId = crypto.randomUUID();
  const path = `${input.companyId.trim()}/${input.conversationId.trim()}/${attachmentId}-${sanitizeFileName(input.file.name)}`;

  input.onProgress?.(10);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.file.type || undefined,
    });

  if (uploadError) throw new Error(uploadError.message);

  input.onProgress?.(100);

  // H3: storagePath is canonical. Do not mint/persist a durable signed URL at upload.
  return {
    id: attachmentId,
    name: input.file.name,
    url: null,
    storagePath: path,
    mimeType: input.file.type || "application/octet-stream",
    fileSize: input.file.size,
    kind,
  };
}

export async function uploadPendingAttachments(input: {
  companyId: string;
  conversationId: string;
  pending: ComposerPendingAttachment[];
  onItemProgress?: (id: string, progress: number) => void;
}): Promise<ComposerUploadedAttachment[]> {
  const uploaded: ComposerUploadedAttachment[] = [];
  for (const item of input.pending) {
    const result = await uploadConversationAttachment({
      companyId: input.companyId,
      conversationId: input.conversationId,
      file: item.file,
      onProgress: (progress) => input.onItemProgress?.(item.id, progress),
    });
    uploaded.push(result);
  }
  return uploaded;
}

/**
 * Persist storagePath as canonical. Do not persist long-lived signed URLs.
 * attachment_url stays null for new internal attachments (schema retained for legacy).
 */
export function buildAttachmentMessageFields(attachments: ComposerUploadedAttachment[]) {
  if (attachments.length === 0) {
    return {
      contentType: "text" as const,
      attachmentType: null,
      attachmentUrl: null,
      mimeType: null,
      fileSize: null,
      metadataAttachments: [] as Record<string, unknown>[],
    };
  }

  const primary = attachments[0]!;
  const contentType = primary.kind === "image" ? ("image" as const) : ("media" as const);

  return {
    contentType,
    attachmentType: primary.kind,
    attachmentUrl: null,
    mimeType: primary.mimeType,
    fileSize: primary.fileSize,
    metadataAttachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      type: attachment.kind,
    })),
  };
}
