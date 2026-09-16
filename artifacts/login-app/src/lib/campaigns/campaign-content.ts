/**
 * Campaign content: customer-facing text, attachments, and picker identity display.
 * Preview and send paths must share these helpers so the wizard shows what recipients get.
 */
import { renderMetaMessagingCampaignText } from "./thread-eligibility";
import type { CampaignContentAttachment, CampaignContentDefinition } from "./types";

export const CAMPAIGN_ATTACHMENT_BUCKET = "entity-files";
export const CAMPAIGN_ATTACHMENT_MAX_FILES = 5;
export const CAMPAIGN_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CAMPAIGN_ATTACHMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const CAMPAIGN_ATTACHMENT_ACCEPT =
  ".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ALLOWED_MIME = new Map<string, string>([
  ["pdf", "application/pdf"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "scr",
  "msi",
  "dll",
  "ps1",
  "vbs",
  "js",
  "jse",
  "wsf",
  "wsh",
  "jar",
  "apk",
  "dmg",
  "sh",
  "html",
  "htm",
  "php",
]);

export type CampaignAttachmentFileLike = {
  name: string;
  type?: string;
  size: number;
};

export type CampaignAttachmentValidation =
  | { ok: true; files: CampaignAttachmentFileLike[] }
  | { ok: false; reason: "too_many" | "too_large" | "unsupported_type" | "empty" | "executable"; message: string };

export function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isCampaignAttachmentExecutable(fileName: string): boolean {
  return BLOCKED_EXTENSIONS.has(fileExtension(fileName));
}

export function resolveCampaignAttachmentMime(file: CampaignAttachmentFileLike): string | null {
  if (isCampaignAttachmentExecutable(file.name)) return null;
  const fromExt = ALLOWED_MIME.get(fileExtension(file.name));
  if (!fromExt) return null;
  const browserMime = String(file.type ?? "")
    .trim()
    .toLowerCase();
  if (
    browserMime &&
    browserMime !== "application/octet-stream" &&
    browserMime !== fromExt &&
    !(fromExt === "image/jpeg" && (browserMime === "image/jpg" || browserMime === "image/pjpeg"))
  ) {
    return null;
  }
  return fromExt;
}

export function validateCampaignAttachmentFiles(
  files: CampaignAttachmentFileLike[],
  options?: { maxFiles?: number; maxBytes?: number; maxTotalBytes?: number },
): CampaignAttachmentValidation {
  const maxFiles = options?.maxFiles ?? CAMPAIGN_ATTACHMENT_MAX_FILES;
  const maxBytes = options?.maxBytes ?? CAMPAIGN_ATTACHMENT_MAX_BYTES;
  const maxTotalBytes = options?.maxTotalBytes ?? CAMPAIGN_ATTACHMENT_MAX_TOTAL_BYTES;

  if (files.length > maxFiles) {
    return {
      ok: false,
      reason: "too_many",
      message: `You can attach up to ${maxFiles} files.`,
    };
  }

  let total = 0;
  for (const file of files) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0) {
      return { ok: false, reason: "empty", message: "One of the selected files is empty." };
    }
    if (isCampaignAttachmentExecutable(file.name)) {
      return {
        ok: false,
        reason: "executable",
        message: `"${file.name}" is not allowed.`,
      };
    }
    if (!resolveCampaignAttachmentMime(file)) {
      return {
        ok: false,
        reason: "unsupported_type",
        message: `"${file.name}" is not supported. Use PDF, DOCX, XLSX, JPG, PNG, or WEBP.`,
      };
    }
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return {
        ok: false,
        reason: "too_large",
        message: `"${file.name}" exceeds the ${mb} MB limit.`,
      };
    }
    total += file.size;
  }

  if (total > maxTotalBytes) {
    const mb = Math.round(maxTotalBytes / (1024 * 1024));
    return {
      ok: false,
      reason: "too_large",
      message: `Attachments together exceed the ${mb} MB limit.`,
    };
  }

  return { ok: true, files };
}

export function isSafeCampaignStoragePath(companyId: string, storagePath: string): boolean {
  const company = companyId.trim();
  const path = storagePath.trim();
  if (!company || !path) return false;
  if (path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
  return path.startsWith(`${company}/`);
}

function parseAttachment(raw: unknown, companyId?: string): CampaignContentAttachment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const mimeType = typeof row.mimeType === "string" ? row.mimeType.trim() : "";
  const storagePath = typeof row.storagePath === "string" ? row.storagePath.trim() : "";
  const fileSize = typeof row.fileSize === "number" ? row.fileSize : Number(row.fileSize);
  if (!id || !name || !mimeType || !storagePath) return null;
  if (!Number.isFinite(fileSize) || fileSize <= 0) return null;
  if (companyId && !isSafeCampaignStoragePath(companyId, storagePath)) return null;
  return { id, name, mimeType, fileSize, storagePath };
}

export function parseCampaignAttachments(
  raw: unknown,
  companyId?: string,
): CampaignContentAttachment[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const attachments: CampaignContentAttachment[] = [];
  for (const item of raw) {
    const parsed = parseAttachment(item, companyId);
    if (!parsed) continue;
    if (seen.has(parsed.storagePath)) continue;
    seen.add(parsed.storagePath);
    attachments.push(parsed);
    if (attachments.length >= CAMPAIGN_ATTACHMENT_MAX_FILES) break;
  }
  return attachments;
}

export function parseCampaignContentDefinition(
  definition: Record<string, unknown> | null | undefined,
  companyId?: string,
): CampaignContentDefinition {
  const source = definition && typeof definition === "object" ? definition : {};
  return {
    campaignTitle:
      typeof source.campaignTitle === "string" ? source.campaignTitle.trim() : "",
    detail: typeof source.detail === "string" ? source.detail.trim() : "",
    attachments: parseCampaignAttachments(source.attachments, companyId),
  };
}

export function serializeCampaignContentDefinition(
  content: CampaignContentDefinition,
  companyId?: string,
): CampaignContentDefinition {
  const parsed = parseCampaignContentDefinition(
    {
      campaignTitle: content.campaignTitle,
      detail: content.detail,
      attachments: content.attachments ?? [],
    },
    companyId,
  );
  return parsed;
}

/** Compact E.164 (no spaces) so RTL table cells keep phone in its own column. */
export function formatCampaignPickerPhone(customer: {
  phone?: string | null;
  phone_e164?: string | null;
  phoneE164?: string | null;
}): string {
  const identity = String(customer.phone_e164 ?? customer.phoneE164 ?? "")
    .replace(/\s+/g, "")
    .trim();
  if (/^\+[1-9]\d{6,14}$/.test(identity)) return identity;
  return String(customer.phone ?? "")
    .replace(/\s+/g, "")
    .trim();
}

export function renderCampaignOutboundText(content: {
  campaignTitle: string;
  detail: string;
}): string {
  return renderMetaMessagingCampaignText(content);
}

export function campaignTextChannelVariables(input: {
  customerName: string;
  content: CampaignContentDefinition;
}): Record<string, string> {
  return {
    customerName: input.customerName,
    campaignTitle: input.content.campaignTitle,
    detail: renderCampaignOutboundText(input.content),
  };
}

export function serializeCampaignAttachmentsForQueue(
  attachments: readonly CampaignContentAttachment[] | undefined,
  companyId: string,
): string {
  const safe = parseCampaignAttachments(attachments ?? [], companyId);
  if (safe.length === 0) return "";
  return JSON.stringify(
    safe.map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      storagePath: item.storagePath,
    })),
  );
}

export function campaignEmailChannelVariables(input: {
  customerName: string;
  content: CampaignContentDefinition;
  companyId: string;
}): Record<string, string> {
  const attachments = serializeCampaignAttachmentsForQueue(
    input.content.attachments,
    input.companyId,
  );
  return {
    customerName: input.customerName,
    campaignTitle: input.content.campaignTitle,
    detail: input.content.detail,
    source: "marketing_campaign",
    ...(attachments ? { campaignAttachments: attachments } : {}),
  };
}

export function formatCampaignAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
