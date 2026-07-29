import type { EmailAuthenticationResults } from "./email-types.js";

const ALLOWED_ATTACHMENT_MIME_PREFIXES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/zip",
  "application/x-zip-compressed",
  "image/",
  "text/plain",
];

export type EmailSecurityValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  authenticationResults?: EmailAuthenticationResults;
};

export function parseAuthenticationResultsHeader(value: string | undefined): EmailAuthenticationResults {
  if (!value?.trim()) return {};

  const lower = value.toLowerCase();
  const results: EmailAuthenticationResults = { raw: { header: value } };

  if (lower.includes("spf=pass")) results.spf = "pass";
  else if (lower.includes("spf=fail")) results.spf = "fail";
  else if (lower.includes("spf=softfail")) results.spf = "softfail";
  else if (lower.includes("spf=neutral")) results.spf = "neutral";
  else if (lower.includes("spf=none")) results.spf = "none";

  if (lower.includes("dkim=pass")) results.dkim = "pass";
  else if (lower.includes("dkim=fail")) results.dkim = "fail";
  else if (lower.includes("dkim=none")) results.dkim = "none";

  if (lower.includes("dmarc=pass")) results.dmarc = "pass";
  else if (lower.includes("dmarc=fail")) results.dmarc = "fail";
  else if (lower.includes("dmarc=none")) results.dmarc = "none";

  return results;
}

export function validateEmailMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return false;
  return ALLOWED_ATTACHMENT_MIME_PREFIXES.some(
    (prefix) => normalized === prefix || (prefix.endsWith("/") && normalized.startsWith(prefix)),
  );
}

export function validateAttachmentSize(sizeBytes: number, maxBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= maxBytes;
}

export type EmailVirusScanHook = (input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}) => Promise<{ clean: boolean; reason?: string }>;

export async function validateInboundEmailSecurity(input: {
  authenticationResults?: EmailAuthenticationResults;
  attachments: Array<{ filename: string; mimeType: string; sizeBytes: number }>;
  maxAttachmentBytes: number;
  virusScanHook?: EmailVirusScanHook;
}): Promise<EmailSecurityValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const auth = input.authenticationResults ?? {};

  if (auth.spf === "fail") warnings.push("spf_fail");
  if (auth.dkim === "fail") warnings.push("dkim_fail");
  if (auth.dmarc === "fail") warnings.push("dmarc_fail");

  for (const attachment of input.attachments) {
    if (!validateEmailMimeType(attachment.mimeType)) {
      errors.push(`unsupported_mime:${attachment.mimeType || "unknown"}`);
      continue;
    }
    if (!validateAttachmentSize(attachment.sizeBytes, input.maxAttachmentBytes)) {
      errors.push(`attachment_too_large:${attachment.filename}`);
    }
    if (input.virusScanHook) {
      const scan = await input.virusScanHook({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      });
      if (!scan.clean) {
        errors.push(`virus_scan_failed:${scan.reason ?? attachment.filename}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    authenticationResults: auth,
  };
}
