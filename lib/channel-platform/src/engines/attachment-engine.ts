import type { ChannelAttachmentDto } from "../dto/channel-dto.js";
import { ATTACHMENT_TYPES, type AttachmentType } from "../constants.js";
import { ValidationError } from "../errors.js";

export class AttachmentEngine {
  normalizeAttachments(raw: unknown): ChannelAttachmentDto[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item, index) => this.normalizeAttachment(item, index))
      .filter((item): item is ChannelAttachmentDto => item !== null);
  }

  private normalizeAttachment(item: unknown, index: number): ChannelAttachmentDto | null {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "document";

    if (!ATTACHMENT_TYPES.includes(type as AttachmentType)) {
      throw new ValidationError(`Unsupported attachment type: ${type}`);
    }

    return {
      attachmentId: typeof record.attachmentId === "string" ? record.attachmentId : `attachment-${index + 1}`,
      type: type as AttachmentType,
      url: typeof record.url === "string" ? record.url : undefined,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
      filename: typeof record.filename === "string" ? record.filename : undefined,
      caption: typeof record.caption === "string" ? record.caption : undefined,
      metadata:
        typeof record.metadata === "object" && record.metadata
          ? (record.metadata as Record<string, unknown>)
          : undefined,
    };
  }
}
