import type { ServiceContext } from "@workspace/channel-platform/client";
import { copyStoredAttachmentToConversation } from "@/lib/omnichannel/services/conversation-attachment-service";
import type { ComposerUploadedAttachment } from "@/lib/omnichannel/types/composer-enterprise-types";
import type { TeamInboxProviderAttachment } from "@/hooks/conversations/use-team-inbox-reply";
import type { UnifiedMessage, UnifiedMessageAttachment } from "@/lib/omnichannel/types/unified-conversation";

function providerMediaType(attachment: UnifiedMessageAttachment): TeamInboxProviderAttachment["type"] {
  if (attachment.type === "audio" || attachment.mimeType?.startsWith("audio/")) return "audio";
  if (attachment.type === "video" || attachment.mimeType?.startsWith("video/")) return "video";
  if (
    attachment.type === "image" ||
    attachment.type === "sticker" ||
    attachment.mimeType?.startsWith("image/")
  ) {
    return "image";
  }
  return "document";
}

export async function prepareForwardedAttachments(input: {
  companyId: string;
  sourceConversationId: string;
  targetConversationId: string;
  message: UnifiedMessage;
  ctx: ServiceContext;
}): Promise<{
  uploaded: ComposerUploadedAttachment[];
  provider: TeamInboxProviderAttachment[];
}> {
  const uploaded: ComposerUploadedAttachment[] = [];
  const provider: TeamInboxProviderAttachment[] = [];

  for (const attachment of input.message.attachments ?? []) {
    const mediaId = attachment.whatsappMediaId?.trim();
    const storagePath = attachment.storagePath?.trim();

    if (storagePath) {
      uploaded.push(
        await copyStoredAttachmentToConversation({
          companyId: input.companyId,
          sourceConversationId: input.sourceConversationId,
          targetConversationId: input.targetConversationId,
          storagePath,
          name: attachment.name || "attachment",
          mimeType: attachment.mimeType || "application/octet-stream",
          ctx: input.ctx,
        }),
      );
      continue;
    }

    if (mediaId) {
      provider.push({
        attachmentId: mediaId,
        type: providerMediaType(attachment),
        mimeType: attachment.mimeType ?? undefined,
        filename: attachment.name ?? undefined,
        metadata: { whatsappMediaId: mediaId },
      });
    }
  }

  return { uploaded, provider };
}
