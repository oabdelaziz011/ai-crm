/**
 * Conversation attachments for the native client.
 * The object path is built from the trusted company and a live conversation.
 * A client-supplied path is accepted only when it matches that pair.
 */
import {
  CONVERSATION_ATTACHMENTS_BUCKET,
  parseConversationAttachmentStoragePath,
} from "@workspace/channel-platform";

export const MOBILE_ATTACHMENT_BUCKET = CONVERSATION_ATTACHMENTS_BUCKET;
export const MOBILE_ATTACHMENT_MAX_BYTES = 26_214_400;
export const MOBILE_ATTACHMENT_URL_SECONDS = 120;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AttachmentRejection = {
  ok: false;
  status: number;
  code: "validation_error" | "forbidden" | "not_found" | "cross_tenant";
  message: string;
};

export function validateAttachmentDescriptor(input: {
  bytes: number;
  mime: string;
  fileName: string;
}): { ok: true; mime: string; fileName: string } | AttachmentRejection {
  const mime = input.mime.trim().toLowerCase();
  const fileName = input.fileName.trim();
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > MOBILE_ATTACHMENT_MAX_BYTES) {
    return { ok: false, status: 400, code: "validation_error", message: "The file is empty or larger than 25 MB." };
  }
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, status: 400, code: "validation_error", message: "This file type cannot be attached." };
  }
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    return { ok: false, status: 400, code: "validation_error", message: "The file name is not valid." };
  }
  return { ok: true, mime, fileName: fileName.slice(0, 80) };
}

export function buildAttachmentObjectPath(input: {
  companyId: string;
  conversationId: string;
  objectId: string;
  fileName: string;
}): string {
  const safe = input.fileName.replace(/[^\w.\-()+\s]/g, "_").slice(0, 80) || "file";
  return `${input.companyId}/${input.conversationId}/${input.objectId}-${safe}`;
}

export function attachmentPathOwnedBy(path: string, companyId: string, conversationId: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/")) return false;
  const parsed = parseConversationAttachmentStoragePath(path);
  return parsed?.companyId === companyId && parsed.conversationId === conversationId;
}

export function authorizeAttachmentConversation(input: {
  sessionCompanyId: string | null;
  claimedCompanyId?: string | null;
  conversation: { id: string; companyId: string } | null;
  canReply: boolean;
  needsReply: boolean;
}): { ok: true; companyId: string; conversationId: string } | AttachmentRejection {
  if (!input.sessionCompanyId) {
    return { ok: false, status: 403, code: "forbidden", message: "A company workspace is required." };
  }
  if (input.claimedCompanyId && input.claimedCompanyId !== input.sessionCompanyId) {
    return { ok: false, status: 403, code: "cross_tenant", message: "Access denied for this company." };
  }
  if (!input.conversation || input.conversation.companyId !== input.sessionCompanyId) {
    return { ok: false, status: 404, code: "not_found", message: "Record not found." };
  }
  if (input.needsReply && !input.canReply) {
    return { ok: false, status: 403, code: "forbidden", message: "Permission denied." };
  }
  if (!UUID.test(input.conversation.id)) {
    return { ok: false, status: 400, code: "validation_error", message: "A conversation id is required." };
  }
  return { ok: true, companyId: input.sessionCompanyId, conversationId: input.conversation.id };
}

/**
 * A caller without conversation read permission is denied before the record is loaded.
 * A missing or other-company conversation stays not found and does not return a URL.
 */
export function decideAttachmentRead(input: {
  canRead: boolean;
  sessionCompanyId: string | null;
  claimedCompanyId?: string | null;
  conversation: { id: string; companyId: string } | null;
}): { ok: true; companyId: string; conversationId: string } | AttachmentRejection {
  if (!input.canRead) {
    return { ok: false, status: 403, code: "forbidden", message: "Permission denied." };
  }
  return authorizeAttachmentConversation({
    sessionCompanyId: input.sessionCompanyId,
    claimedCompanyId: input.claimedCompanyId,
    conversation: input.conversation,
    canReply: true,
    needsReply: false,
  });
}
