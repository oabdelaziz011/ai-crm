import {
  COMPOSER_ATTACHMENT_ACCEPT,
  COMPOSER_MAX_ATTACHMENTS,
  type ComposerAttachmentKind,
} from "../omnichannel/types/composer-enterprise-types";

export const EMAIL_COMPOSER_MAX_ATTACHMENTS = COMPOSER_MAX_ATTACHMENTS;
export const EMAIL_COMPOSER_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const EMAIL_COMPOSER_ATTACHMENT_ACCEPT = COMPOSER_ATTACHMENT_ACCEPT;

export const EMAIL_ALLOWED_ATTACHMENT_EXTENSIONS: Record<
  string,
  { mime: string; kind: ComposerAttachmentKind }
> = {
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  png: { mime: "image/png", kind: "image" },
  gif: { mime: "image/gif", kind: "image" },
  webp: { mime: "image/webp", kind: "image" },
  pdf: { mime: "application/pdf", kind: "pdf" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "xlsx",
  },
  txt: { mime: "text/plain", kind: "txt" },
};

export const EMAIL_BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "cpl",
  "dll",
  "msi",
  "msp",
  "scr",
  "js",
  "jse",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  "ps1",
  "jar",
  "hta",
  "pif",
  "reg",
  "inf",
  "lnk",
  "sh",
  "bash",
  "apk",
  "iso",
  "dmg",
]);

export type EmailComposerFileValidationReason =
  | "too_large"
  | "too_many"
  | "unsupported_type"
  | "dangerous_type"
  | "invalid_filename";

export type EmailComposerFileValidation =
  | { ok: true; kind: ComposerAttachmentKind; mimeType: string; filename: string }
  | { ok: false; reason: EmailComposerFileValidationReason };

export function sanitizeEmailAttachmentFilename(name: string): string {
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

function extensionOf(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts.pop()!.toLowerCase();
}

function mimeMatchesAllowed(browserMime: string, allowedMime: string): boolean {
  if (!browserMime || browserMime === "application/octet-stream") return true;
  if (browserMime === allowedMime) return true;
  if (allowedMime === "image/jpeg" && (browserMime === "image/jpg" || browserMime === "image/pjpeg")) {
    return true;
  }
  return false;
}

export function validateEmailComposerFile(
  file: { name: string; type?: string; size: number },
  currentCount: number,
): EmailComposerFileValidation {
  if (currentCount >= EMAIL_COMPOSER_MAX_ATTACHMENTS) {
    return { ok: false, reason: "too_many" };
  }
  const filename = sanitizeEmailAttachmentFilename(file.name);
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return { ok: false, reason: "invalid_filename" };
  }
  const ext = extensionOf(filename);
  if (!ext) return { ok: false, reason: "unsupported_type" };
  if (EMAIL_BLOCKED_ATTACHMENT_EXTENSIONS.has(ext)) {
    return { ok: false, reason: "dangerous_type" };
  }
  const allowed = EMAIL_ALLOWED_ATTACHMENT_EXTENSIONS[ext];
  if (!allowed) return { ok: false, reason: "unsupported_type" };
  const browserMime = String(file.type || "")
    .trim()
    .toLowerCase();
  if (!mimeMatchesAllowed(browserMime, allowed.mime)) {
    return { ok: false, reason: "unsupported_type" };
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > EMAIL_COMPOSER_MAX_FILE_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  return { ok: true, kind: allowed.kind, mimeType: allowed.mime, filename };
}

export function formatEmailAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
