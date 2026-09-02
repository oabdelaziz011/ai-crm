/** Sprint 11 — omnichannel composer enterprise payloads. */

export const COMPOSER_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf,.docx,.xlsx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const COMPOSER_MAX_ATTACHMENTS = 10;

export type ComposerAttachmentKind = "image" | "pdf" | "docx" | "xlsx" | "txt" | "file";

export type ComposerPendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  kind: ComposerAttachmentKind;
  status: "ready" | "uploading" | "failed";
  progress: number;
};

export type ComposerUploadedAttachment = {
  id: string;
  name: string;
  /** Ephemeral only — never the durable source of truth (H3). */
  url?: string | null;
  /** Canonical durable reference for conversation-attachments objects. */
  storagePath: string;
  mimeType: string;
  fileSize: number;
  kind: ComposerAttachmentKind;
};

export type ComposerMentionTarget = {
  id: string;
  type: "agent" | "team";
  label: string;
  handle: string;
  online?: boolean;
};

export type ComposerMention = {
  targetId: string;
  targetType: "agent" | "team";
  label: string;
  handle: string;
};

export type ComposerSendPayload = {
  text: string;
  mode: "reply" | "internal_note";
  attachments?: ComposerUploadedAttachment[];
  mentions?: ComposerMention[];
};

export type ComposerTranslateAction = "replace" | "insert_below" | "copy";
