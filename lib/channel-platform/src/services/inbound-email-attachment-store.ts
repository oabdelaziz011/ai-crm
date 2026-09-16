/**
 * Persist inbound email attachment bytes into conversation-attachments.
 * Canonical durable reference is storagePath; binary is never kept on message metadata.
 */
import { randomUUID } from "@workspace/platform-crypto";
import type { ChannelAttachmentDto } from "../dto/channel-dto.js";
import { CONVERSATION_ATTACHMENTS_BUCKET } from "./conversation-attachment-url.js";

export { CONVERSATION_ATTACHMENTS_BUCKET };

const SKIP_USER_FACING_MIME_PREFIXES = [
  "text/rfc822-headers",
  "message/rfc822",
  "message/delivery-status",
  "multipart/report",
];

const STASH_TTL_MS = 15 * 60 * 1000;
const inboundByteStash = new Map<string, { bytes: Buffer; expiresAt: number }>();

export type InboundStoredAttachment = {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  kind: "image" | "pdf" | "docx" | "xlsx" | "txt" | "file";
};

export type InboundAttachmentStorePort = {
  store(input: {
    companyId: string;
    conversationId: string;
    filename: string;
    mimeType: string;
    content: Buffer;
  }): Promise<InboundStoredAttachment>;
};

export function stashInboundAttachmentBytes(bytes: Buffer): string {
  pruneInboundAttachmentStash();
  const id = randomUUID();
  inboundByteStash.set(id, { bytes, expiresAt: Date.now() + STASH_TTL_MS });
  return id;
}

export function peekStashedInboundAttachmentBytes(id: string): Buffer | null {
  pruneInboundAttachmentStash();
  const entry = inboundByteStash.get(id);
  return entry?.bytes ?? null;
}

export function releaseStashedInboundAttachmentBytes(id: string): void {
  inboundByteStash.delete(id);
}

function pruneInboundAttachmentStash(): void {
  const now = Date.now();
  for (const [id, entry] of inboundByteStash) {
    if (entry.expiresAt <= now) inboundByteStash.delete(id);
  }
}

export function sanitizeInboundAttachmentFilename(name: string): string {
  const base =
    String(name || "")
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.trim() || "attachment";
  const cleaned = base
    .replace(/[^\w.\-()+\s]/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  return cleaned || "attachment";
}

export function resolveInboundAttachmentKind(
  filename: string,
  mimeType: string,
): InboundStoredAttachment["kind"] {
  const mime = mimeType.trim().toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mime.includes("spreadsheetml") || ext === "xlsx") return "xlsx";
  if (mime === "text/plain" || ext === "txt") return "txt";
  return "file";
}

export function isNonUserFacingInboundAttachment(input: {
  mimeType?: string | null;
  isInline?: boolean;
  contentId?: string | null;
  related?: boolean;
}): boolean {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (SKIP_USER_FACING_MIME_PREFIXES.some((prefix) => mime === prefix || mime.startsWith(`${prefix}+`))) {
    return true;
  }
  if (input.related) return true;
  if (input.isInline && input.contentId) return true;
  return false;
}

export function decodeInboundAttachmentBytes(input: {
  content?: unknown;
  contentBase64?: unknown;
  contentRef?: unknown;
  metadata?: Record<string, unknown> | null;
}): Buffer | null {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const contentRef =
    typeof input.contentRef === "string" && input.contentRef.trim()
      ? input.contentRef.trim()
      : typeof metadata.contentRef === "string" && metadata.contentRef.trim()
        ? metadata.contentRef.trim()
        : "";
  if (contentRef) {
    const stashed = peekStashedInboundAttachmentBytes(contentRef);
    if (stashed) return stashed;
  }

  if (Buffer.isBuffer(input.content)) return input.content;
  if (input.content instanceof Uint8Array) return Buffer.from(input.content);

  const serialized = input.content as { type?: string; data?: number[] } | null;
  if (serialized && serialized.type === "Buffer" && Array.isArray(serialized.data)) {
    return Buffer.from(serialized.data);
  }

  const base64 =
    typeof input.contentBase64 === "string" && input.contentBase64.trim()
      ? input.contentBase64.trim()
      : typeof metadata.contentBase64 === "string" && metadata.contentBase64.trim()
        ? metadata.contentBase64.trim()
        : "";
  if (base64) {
    try {
      const bytes = Buffer.from(base64, "base64");
      return bytes.length > 0 ? bytes : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function stripInboundAttachmentBinaries(payload: Record<string, unknown>): Record<string, unknown> {
  const attachments = payload.attachments;
  if (!Array.isArray(attachments)) return payload;
  return {
    ...payload,
    attachments: attachments.map((item) => {
      if (!item || typeof item !== "object") return item;
      const record = { ...(item as Record<string, unknown>) };
      delete record.content;
      delete record.contentBase64;
      delete record.contentRef;
      if (record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)) {
        const metadata = { ...(record.metadata as Record<string, unknown>) };
        delete metadata.content;
        delete metadata.contentBase64;
        delete metadata.contentRef;
        record.metadata = metadata;
      }
      return record;
    }),
  };
}

function readAttachmentFlag(record: Record<string, unknown>, key: string): boolean {
  if (record[key] === true) return true;
  const metadata = record.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return (metadata as Record<string, unknown>)[key] === true;
  }
  return false;
}

function readAttachmentString(record: Record<string, unknown>, key: string): string | null {
  const direct = record[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const metadata = record.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const nested = (metadata as Record<string, unknown>)[key];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return null;
}

function toUserFacingAttachment(attachment: ChannelAttachmentDto): ChannelAttachmentDto {
  const metadata = { ...(attachment.metadata ?? {}) };
  delete metadata.content;
  delete metadata.contentBase64;
  delete metadata.contentRef;
  return {
    ...attachment,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function toStoredChannelAttachment(stored: InboundStoredAttachment): ChannelAttachmentDto {
  return {
    attachmentId: stored.id,
    type: stored.kind === "image" ? "image" : "document",
    mimeType: stored.mimeType,
    filename: stored.name,
    metadata: {
      id: stored.id,
      name: stored.name,
      storagePath: stored.storagePath,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
      kind: stored.kind,
    },
    // Flattened for Email Workspace / omnichannel display (same shape as outbound).
    id: stored.id,
    name: stored.name,
    storagePath: stored.storagePath,
    fileSize: stored.fileSize,
    kind: stored.kind,
  } as ChannelAttachmentDto & Record<string, unknown>;
}

export async function materializeInboundEmailAttachments(input: {
  companyId: string;
  conversationId: string;
  attachments: ChannelAttachmentDto[];
  store?: InboundAttachmentStorePort;
}): Promise<ChannelAttachmentDto[]> {
  const results: ChannelAttachmentDto[] = [];

  for (const attachment of input.attachments) {
    const record = attachment as ChannelAttachmentDto & Record<string, unknown>;
    const mimeType = (attachment.mimeType ?? "application/octet-stream").trim();
    const filename =
      (typeof record.name === "string" && record.name.trim()) ||
      (typeof attachment.filename === "string" && attachment.filename.trim()) ||
      "attachment";
    const isInline = readAttachmentFlag(record, "isInline");
    const related = readAttachmentFlag(record, "related");
    const contentId = readAttachmentString(record, "contentId") ?? readAttachmentString(record, "cid");

    if (
      isNonUserFacingInboundAttachment({
        mimeType,
        isInline,
        contentId,
        related,
      })
    ) {
      const contentRef = readAttachmentString(record, "contentRef");
      if (contentRef) releaseStashedInboundAttachmentBytes(contentRef);
      continue;
    }

    const existingPath =
      typeof record.storagePath === "string" && record.storagePath.trim()
        ? record.storagePath.trim()
        : typeof attachment.metadata?.storagePath === "string"
          ? String(attachment.metadata.storagePath).trim()
          : "";
    if (existingPath) {
      results.push(toUserFacingAttachment(attachment));
      continue;
    }

    const bytes = decodeInboundAttachmentBytes({
      content: record.content,
      contentBase64: record.contentBase64,
      contentRef: record.contentRef,
      metadata: attachment.metadata,
    });
    const contentRef = readAttachmentString(record, "contentRef");

    if (!bytes || !input.store) {
      if (contentRef) releaseStashedInboundAttachmentBytes(contentRef);
      results.push(toUserFacingAttachment(attachment));
      continue;
    }

    try {
      const stored = await input.store.store({
        companyId: input.companyId,
        conversationId: input.conversationId,
        filename,
        mimeType,
        content: bytes,
      });
      if (contentRef) releaseStashedInboundAttachmentBytes(contentRef);
      results.push(toStoredChannelAttachment(stored));
    } catch {
      if (contentRef) releaseStashedInboundAttachmentBytes(contentRef);
      results.push(toUserFacingAttachment(attachment));
    }
  }

  return results;
}
