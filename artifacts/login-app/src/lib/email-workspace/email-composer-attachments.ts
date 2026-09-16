/**
 * Email composer attachments — thin wrappers over existing conversation-attachments
 * storage + omnichannel upload. Not a second attachment architecture.
 */
import { supabase } from "@/lib/supabase";
import { FeatureNotEntitledError, requireCompanyFeature } from "@/lib/billing/require-company-feature";
import {
  CONVERSATION_ATTACHMENTS_BUCKET,
  parseConversationAttachmentStoragePath,
} from "@workspace/channel-platform/client";
import {
  assertConversationAttachmentUploadTarget,
  uploadConversationAttachment,
} from "@/lib/omnichannel/services/conversation-attachment-service";
import type { ComposerUploadedAttachment } from "@/lib/omnichannel/types/composer-enterprise-types";
import type { EmailComposerDraftAttachment } from "@/lib/email-workspace/email-thread-outbound";
import { validateEmailComposerFile } from "@/lib/email-workspace/email-composer-attachment-validation";

export { FeatureNotEntitledError };
export {
  EMAIL_ALLOWED_ATTACHMENT_EXTENSIONS,
  EMAIL_BLOCKED_ATTACHMENT_EXTENSIONS,
  EMAIL_COMPOSER_ATTACHMENT_ACCEPT,
  EMAIL_COMPOSER_MAX_ATTACHMENTS,
  EMAIL_COMPOSER_MAX_FILE_BYTES,
  formatEmailAttachmentSize,
  sanitizeEmailAttachmentFilename,
  validateEmailComposerFile,
  type EmailComposerFileValidation,
  type EmailComposerFileValidationReason,
} from "@/lib/email-workspace/email-composer-attachment-validation";

export const EMAIL_CHANNEL_FEATURE_CODE = "email_channel";


export function toEmailComposerDraftAttachments(
  attachments: EmailComposerDraftAttachment[],
): EmailComposerDraftAttachment[] {
  return attachments.map((item) => ({
    id: item.id,
    name: item.name,
    storagePath: item.storagePath,
    mimeType: item.mimeType,
    fileSize: item.fileSize,
    kind: item.kind,
  }));
}

export async function assertEmailConversationAttachmentTarget(input: {
  companyId: string;
  conversationId: string;
}): Promise<void> {
  const companyId = input.companyId?.trim();
  const conversationId = input.conversationId?.trim();
  if (!companyId || !conversationId) {
    throw new Error("Conversation context required for attachment upload.");
  }

  await requireCompanyFeature(supabase, companyId, EMAIL_CHANNEL_FEATURE_CODE);

  const { data, error } = await supabase
    .from("conversations")
    .select("id, company_id, channel_type, deleted_at")
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
  if (String(data.channel_type) !== "email") {
    throw new Error("Attachments are only supported on email conversations.");
  }

  await assertConversationAttachmentUploadTarget({ companyId, conversationId });
}

export async function uploadEmailComposerAttachment(input: {
  companyId: string;
  conversationId: string;
  file: File;
  currentCount: number;
  onProgress?: (progress: number) => void;
}): Promise<ComposerUploadedAttachment> {
  const validated = validateEmailComposerFile(input.file, input.currentCount);
  if (!validated.ok) {
    throw new Error(validated.reason);
  }

  await assertEmailConversationAttachmentTarget({
    companyId: input.companyId,
    conversationId: input.conversationId,
  });

  const file = new File([input.file], validated.filename, { type: validated.mimeType });
  return uploadConversationAttachment({
    companyId: input.companyId.trim(),
    conversationId: input.conversationId.trim(),
    file,
    onProgress: input.onProgress,
  });
}

async function storagePathReferencedBySentMessages(
  conversationId: string,
  storagePath: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("id, metadata")
    .eq("conversation_id", conversationId)
    .limit(500);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const raw = (row.metadata as Record<string, unknown> | null)?.attachments;
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const path = String((entry as Record<string, unknown>).storagePath ?? "").trim();
      if (path && path === storagePath) return true;
    }
  }
  return false;
}

export async function removeEmailComposerAttachmentObject(input: {
  companyId: string;
  conversationId: string;
  storagePath: string;
}): Promise<{ deleted: boolean; reason?: string }> {
  const companyId = input.companyId?.trim();
  const conversationId = input.conversationId?.trim();
  const storagePath = input.storagePath?.trim();
  if (!companyId || !conversationId || !storagePath) {
    return { deleted: false, reason: "invalid_target" };
  }

  const parsed = parseConversationAttachmentStoragePath(storagePath);
  if (!parsed || parsed.companyId !== companyId || parsed.conversationId !== conversationId) {
    throw new Error("Attachment does not belong to this company conversation.");
  }

  await assertEmailConversationAttachmentTarget({ companyId, conversationId });

  if (await storagePathReferencedBySentMessages(conversationId, storagePath)) {
    return { deleted: false, reason: "still_referenced" };
  }

  const { error } = await supabase.storage.from(CONVERSATION_ATTACHMENTS_BUCKET).remove([storagePath]);
  if (error) throw new Error(error.message);
  return { deleted: true };
}
