/**
 * Omnichannel Phase 2C (H3) — conversation-attachments signed URL resolution.
 *
 * Canonical durable reference: storagePath ({companyId}/{conversationId}/…).
 * Signed URLs are ephemeral and never the source of truth.
 *
 * TTL: Meta async media-fetch window is TBD in-repo. Default retains the prior
 * 7-day value for outbound compatibility until a measured window is chosen.
 * Override via CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS or expiresInSeconds.
 */
import type { ChannelAttachmentDto } from "../dto/channel-dto.js";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { ServiceContext } from "../types.js";

export const CONVERSATION_ATTACHMENTS_BUCKET = "conversation-attachments";

/** H2/H3 attachment access codes (no conversation.* aliases). */
export const CONVERSATION_ATTACHMENT_VIEW_PERMISSION = "ai.conversations.view";
export const CONVERSATION_ATTACHMENT_REPLY_PERMISSION = "ai.conversations.reply";

/**
 * Default ephemeral signed URL lifetime (seconds).
 * TBD: production Meta provider fetch window not established in repository —
 * keep prior 7-day default until measured; change via env/override only.
 */
export const DEFAULT_CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedConversationAttachmentPath = {
  companyId: string;
  conversationId: string;
};

export type LiveConversationForAttachment = {
  id: string;
  companyId: string;
};

export type ConversationAttachmentUrlAuthz = {
  /**
   * Load a non-deleted conversation by id.
   * Must return null when missing/deleted/inaccessible.
   * Callers using service-role must still verify companyId match after load.
   */
  loadLiveConversation: (conversationId: string) => Promise<LiveConversationForAttachment | null>;
  /** Mint a signed URL for an object in conversation-attachments. */
  createSignedUrl: (storagePath: string, expiresInSeconds: number) => Promise<string>;
};

export function getConversationAttachmentSignedUrlSeconds(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  if (typeof process !== "undefined" && process.env?.CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS) {
    const fromEnv = Number(process.env.CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  }
  return DEFAULT_CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS;
}

export function parseConversationAttachmentStoragePath(
  storagePath: string | null | undefined,
): ParsedConversationAttachmentPath | null {
  if (!storagePath || typeof storagePath !== "string") return null;
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/")) return null;

  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 3) return null;

  const companyId = parts[0]!;
  const conversationId = parts[1]!;
  if (!UUID_RE.test(companyId) || !UUID_RE.test(conversationId)) return null;

  return { companyId, conversationId };
}

export function isInternalConversationAttachmentStoragePath(
  storagePath: string | null | undefined,
): boolean {
  return parseConversationAttachmentStoragePath(storagePath) != null;
}

/** Detect persisted Supabase signed URLs for this bucket (legacy / non-authoritative). */
export function isConversationAttachmentsSignedUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /\/storage\/v1\/object\/sign\/conversation-attachments\//i.test(url);
}

export function readAttachmentStoragePath(
  attachment: ChannelAttachmentDto | { metadata?: Record<string, unknown> | null },
): string | null {
  const metadata = attachment.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const path = metadata.storagePath;
  return typeof path === "string" && path.trim() ? path.trim() : null;
}

/**
 * Fail-closed permission gate aligned with H2 taxonomy.
 * Super-admin still requires path/conversation ownership checks elsewhere.
 */
export function assertConversationAttachmentAccess(
  ctx: ServiceContext,
  companyId: string,
): void {
  const expected = companyId.trim();
  if (!expected) {
    throw new PermissionDeniedError(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  }

  if (ctx.isSuperAdmin) return;

  if (!ctx.companyId || ctx.companyId !== expected) {
    throw new PermissionDeniedError(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  }

  const canView = ctx.hasPermission(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  const canReply = ctx.hasPermission(CONVERSATION_ATTACHMENT_REPLY_PERMISSION);
  if (!canView && !canReply) {
    throw new PermissionDeniedError(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  }
}

/**
 * Authorize + mint an ephemeral signed URL for an internal conversation attachment.
 * storagePath is canonical; never trusts client company/conversation alone.
 */
export async function resolveConversationAttachmentUrl(input: {
  companyId: string;
  conversationId: string;
  storagePath: string;
  ctx: ServiceContext;
  authz: ConversationAttachmentUrlAuthz;
  expiresInSeconds?: number;
}): Promise<string> {
  const companyId = input.companyId?.trim() ?? "";
  const conversationId = input.conversationId?.trim() ?? "";
  const storagePath = input.storagePath?.trim() ?? "";

  if (!companyId || !conversationId || !storagePath) {
    throw new ValidationError("Conversation attachment context is incomplete.");
  }

  assertConversationAttachmentAccess(input.ctx, companyId);

  const parsed = parseConversationAttachmentStoragePath(storagePath);
  if (!parsed) {
    throw new ValidationError("Malformed conversation attachment storage path.");
  }

  if (parsed.companyId !== companyId || parsed.conversationId !== conversationId) {
    throw new PermissionDeniedError(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  }

  const live = await input.authz.loadLiveConversation(conversationId);
  if (!live?.id) {
    throw new PermissionDeniedError(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  }
  if (live.companyId !== companyId || live.id !== conversationId) {
    throw new PermissionDeniedError(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  }
  if (parsed.companyId !== live.companyId || parsed.conversationId !== live.id) {
    throw new PermissionDeniedError(CONVERSATION_ATTACHMENT_VIEW_PERMISSION);
  }

  const expiresIn = getConversationAttachmentSignedUrlSeconds(input.expiresInSeconds);
  const signedUrl = await input.authz.createSignedUrl(storagePath, expiresIn);
  if (!signedUrl?.trim()) {
    throw new ValidationError("Failed to sign conversation attachment URL.");
  }
  return signedUrl;
}

/**
 * Resolve outbound attachments once per dispatch attempt.
 * Internal storagePath → fresh signed URL; external URLs / media IDs pass through.
 */
export async function resolveOutboundAttachments(input: {
  companyId: string;
  conversationId: string;
  attachments: ChannelAttachmentDto[];
  ctx: ServiceContext;
  authz: ConversationAttachmentUrlAuthz;
  expiresInSeconds?: number;
}): Promise<ChannelAttachmentDto[]> {
  const results: ChannelAttachmentDto[] = [];

  for (const attachment of input.attachments) {
    const storagePath = readAttachmentStoragePath(attachment);
    if (!storagePath) {
      results.push(attachment);
      continue;
    }

    if (!isInternalConversationAttachmentStoragePath(storagePath)) {
      results.push(attachment);
      continue;
    }

    const url = await resolveConversationAttachmentUrl({
      companyId: input.companyId,
      conversationId: input.conversationId,
      storagePath,
      ctx: input.ctx,
      authz: input.authz,
      expiresInSeconds: input.expiresInSeconds,
    });

    results.push({
      ...attachment,
      url,
      metadata: {
        ...(attachment.metadata ?? {}),
        storagePath,
      },
    });
  }

  return results;
}

export type ConversationAttachmentUrlPort = {
  resolveOutboundAttachments(input: {
    companyId: string;
    conversationId: string;
    attachments: ChannelAttachmentDto[];
    ctx: ServiceContext;
    expiresInSeconds?: number;
  }): Promise<ChannelAttachmentDto[]>;
};

/** Build a port that validates ownership then signs (safe for service-role clients). */
export function createConversationAttachmentUrlPort(
  authz: ConversationAttachmentUrlAuthz,
): ConversationAttachmentUrlPort {
  return {
    resolveOutboundAttachments(input) {
      return resolveOutboundAttachments({
        companyId: input.companyId,
        conversationId: input.conversationId,
        attachments: input.attachments,
        ctx: input.ctx,
        authz,
        expiresInSeconds: input.expiresInSeconds,
      });
    },
  };
}
