import { uploadEntityNoteFileWithProgress } from "@/lib/entity-workspace/services/entity-file-upload";
import type { CampaignContentAttachment } from "@/lib/campaigns/types";
import { resolveCampaignAttachmentMime } from "@/lib/campaigns/campaign-content";

export async function uploadCampaignContentAttachments(input: {
  companyId: string;
  campaignKey: string;
  files: File[];
}): Promise<CampaignContentAttachment[]> {
  const uploaded: CampaignContentAttachment[] = [];
  for (const file of input.files) {
    const mimeType = resolveCampaignAttachmentMime(file) ?? file.type;
    const result = await uploadEntityNoteFileWithProgress({
      tenantId: input.companyId,
      entityType: "campaigns",
      entityId: input.campaignKey,
      activityId: "content",
      file,
    });
    uploaded.push({
      id: crypto.randomUUID(),
      name: result.fileName || file.name,
      mimeType: result.mimeType || mimeType,
      fileSize: result.sizeBytes || file.size,
      storagePath: result.storagePath,
    });
  }
  return uploaded;
}
