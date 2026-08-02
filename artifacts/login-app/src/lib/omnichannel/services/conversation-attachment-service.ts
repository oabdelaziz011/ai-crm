import { supabase } from "@/lib/supabase";
import type {
  ComposerAttachmentKind,
  ComposerPendingAttachment,
  ComposerUploadedAttachment,
} from "@/lib/omnichannel/types/composer-enterprise-types";
import { COMPOSER_MAX_ATTACHMENTS } from "@/lib/omnichannel/types/composer-enterprise-types";

const BUCKET = "conversation-attachments";

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

export async function uploadConversationAttachment(input: {
  companyId: string;
  conversationId: string;
  file: File;
  onProgress?: (progress: number) => void;
}): Promise<ComposerUploadedAttachment> {
  const kind = resolveAttachmentKind(input.file);
  if (!kind) throw new Error("Unsupported attachment type");

  const attachmentId = crypto.randomUUID();
  const path = `${input.companyId}/${input.conversationId}/${attachmentId}-${sanitizeFileName(input.file.name)}`;

  input.onProgress?.(10);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.file.type || undefined,
    });

  if (uploadError) throw new Error(uploadError.message);

  input.onProgress?.(85);

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signError || !signed?.signedUrl) throw new Error(signError?.message ?? "Failed to sign attachment URL");

  input.onProgress?.(100);

  return {
    id: attachmentId,
    name: input.file.name,
    url: signed.signedUrl,
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
    attachmentUrl: primary.url,
    mimeType: primary.mimeType,
    fileSize: primary.fileSize,
    metadataAttachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      type: attachment.kind,
    })),
  };
}
