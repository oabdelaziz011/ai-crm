/**
 * Structured Email Identity signature stored at companies.branding.email.signature.
 * Legacy string values normalize to { name: plainText, title/email/website: "" }.
 * Never invent company-specific defaults.
 */

export type EmailSignatureColors = {
  name: string;
  title: string;
  email: string;
  website: string;
};

export type EmailSignatureConfig = {
  name: string;
  title: string;
  email: string;
  website: string;
  colors: EmailSignatureColors;
};

/** Matches the existing signature block / link text color. */
export const DEFAULT_EMAIL_SIGNATURE_FIELD_COLOR = "#111827";

export function emptyEmailSignatureColors(): EmailSignatureColors {
  return {
    name: DEFAULT_EMAIL_SIGNATURE_FIELD_COLOR,
    title: DEFAULT_EMAIL_SIGNATURE_FIELD_COLOR,
    email: DEFAULT_EMAIL_SIGNATURE_FIELD_COLOR,
    website: DEFAULT_EMAIL_SIGNATURE_FIELD_COLOR,
  };
}

export function emptyEmailSignatureConfig(): EmailSignatureConfig {
  return { name: "", title: "", email: "", website: "", colors: emptyEmailSignatureColors() };
}

/** Persist/render-safe CSS hex (#RGB / #RRGGBB). Invalid values fall back. */
export function normalizeSignatureHexColor(
  raw: unknown,
  fallback: string = DEFAULT_EMAIL_SIGNATURE_FIELD_COLOR,
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const h = trimmed.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  return fallback;
}

function normalizeEmailSignatureColors(raw: unknown): EmailSignatureColors {
  const defaults = emptyEmailSignatureColors();
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    name: normalizeSignatureHexColor(r.name, defaults.name),
    title: normalizeSignatureHexColor(r.title, defaults.title),
    email: normalizeSignatureHexColor(r.email, defaults.email),
    website: normalizeSignatureHexColor(r.website, defaults.website),
  };
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/'/g, "&#39;");
}

/** Gmail ignores many CSS colors; `<font color>` is the durable outbound signal. */
function coloredFontHtml(textHtml: string, color: string, extraStyle = ""): string {
  const style = extraStyle ? `color:${color};${extraStyle}` : `color:${color};`;
  return `<font color="${color}" style="${style}">${textHtml}</font>`;
}

/** Strip tags / entities for legacy HTML → plain name. */
export function plainTextFromLegacySignature(raw: string): string {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function isValidSignatureEmail(value: string): boolean {
  const email = value.trim();
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Display form as typed; href gets https:// when protocol missing. */
export function normalizeSignatureWebsiteHref(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^javascript:/i.test(raw) || /^data:/i.test(raw) || /[\s<>"']/.test(raw)) {
    return null;
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.toString();
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(`https://${raw}`);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isValidSignatureWebsite(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  return normalizeSignatureWebsiteHref(raw) != null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize companies.branding.email.signature (string | object | empty).
 * Legacy string → name only. Never invent title/email/website.
 */
export function normalizeEmailSignatureConfig(raw: unknown): EmailSignatureConfig {
  if (raw == null) return emptyEmailSignatureConfig();

  if (typeof raw === "string") {
    const name = plainTextFromLegacySignature(raw);
    return { name, title: "", email: "", website: "", colors: emptyEmailSignatureColors() };
  }

  const r = readRecord(raw);
  return {
    name: asTrimmedString(r.name),
    title: asTrimmedString(r.title),
    email: asTrimmedString(r.email),
    website: asTrimmedString(r.website),
    colors: normalizeEmailSignatureColors(r.colors),
  };
}

export function hasEmailSignatureConfig(
  signature: Partial<EmailSignatureConfig> | string | null | undefined,
): boolean {
  const config = normalizeEmailSignatureConfig(signature);
  return Boolean(
    config.name || config.title || config.email || config.website,
  );
}

/**
 * Safe HTML for outbound / preview. Empty optional fields omit lines (no blank separators).
 */
export function renderEmailSignatureHtml(
  signature: Partial<EmailSignatureConfig> | string | null | undefined,
): string {
  const config = normalizeEmailSignatureConfig(signature);
  const lines: Array<{ html: string; kind: "name" | "title" | "email" | "website" }> = [];

  const colors = config.colors ?? emptyEmailSignatureColors();

  if (config.name) {
    lines.push({
      kind: "name",
      html: coloredFontHtml(escapeHtmlText(config.name), colors.name),
    });
  }
  if (config.title) {
    lines.push({
      kind: "title",
      html: coloredFontHtml(escapeHtmlText(config.title), colors.title),
    });
  }
  if (config.email) {
    const safeEmail = escapeHtmlText(config.email);
    const href = escapeHtmlAttr(`mailto:${config.email}`);
    lines.push({
      kind: "email",
      html: `<a href="${href}" style="color:${colors.email};text-decoration:none;">${coloredFontHtml(safeEmail, colors.email, "text-decoration:none;")}</a>`,
    });
  }
  if (config.website) {
    const href = normalizeSignatureWebsiteHref(config.website);
    const display = escapeHtmlText(config.website);
    if (href) {
      lines.push({
        kind: "website",
        html: `<a href="${escapeHtmlAttr(href)}" style="color:${colors.website};text-decoration:none;">${coloredFontHtml(display, colors.website, "text-decoration:none;")}</a>`,
      });
    } else {
      lines.push({
        kind: "website",
        html: coloredFontHtml(display, colors.website),
      });
    }
  }

  if (lines.length === 0) return "";

  // Stacked divs (not a trailing table): Gmail clips nested/trailing signature
  // tables behind "...", then restyles the hidden block as one muted color.
  const rows = lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const margin = isLast ? "0" : "0 0 4px 0";
    const color = colors[line.kind];
    const bold = line.kind === "name" ? "font-weight:bold;" : "";
    return `<div style="margin:${margin};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;${bold}color:${color};">${line.html}</div>`;
  });
  return `<div style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${rows.join("")}</div>`;
}

/** Persistable object for companies.branding.email.signature (never a legacy string). */
export function toPersistedEmailSignature(
  signature: Partial<EmailSignatureConfig> | string | null | undefined,
): EmailSignatureConfig {
  return normalizeEmailSignatureConfig(signature);
}
