/**
 * WhatsApp Cloud API can only fetch https image links reachable from Meta's
 * servers. Local catalog uploads live on http://127.0.0.1:54321 — rewrite those
 * through the developer public webhook base so Meta can pull them.
 */

const LOCAL_COMPANY_BRANDING =
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/storage\/v1\/object\/public\/company-branding\/(.+)$/i;

const PUBLIC_HTTPS = /^https:\/\/\S+$/i;
const LOCAL_HTTPS_HOST = /^https:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i;

export function publicWebhookBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const key of ["PUBLIC_WEBHOOK_BASE_URL", "WEBHOOK_BASE_URL", "VITE_WEBHOOK_BASE_URL"]) {
    const raw = typeof env[key] === "string" ? env[key]!.trim().replace(/\/+$/, "") : "";
    if (PUBLIC_HTTPS.test(raw) && !LOCAL_HTTPS_HOST.test(`${raw}/`)) return raw;
  }
  return null;
}

/** Object path inside the public company-branding bucket, or null if unsafe. */
export function companyBrandingObjectPath(url: string): string | null {
  const trimmed = url.trim();
  const match = LOCAL_COMPANY_BRANDING.exec(trimmed);
  if (!match?.[1]) return null;
  return sanitizeCompanyBrandingObjectPath(match[1]);
}

export function sanitizeCompanyBrandingObjectPath(raw: string): string | null {
  const decoded = decodeURIComponent(raw.split("?")[0] ?? "").replace(/^\/+/, "").replace(/\\/g, "/");
  if (!decoded || decoded.includes("..") || decoded.length > 1024) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(decoded)) {
    return null;
  }
  // Align with company-brand upload sanitizeFileName (plus path separators).
  if (!/^[A-Za-z0-9._/\-+() ]+$/.test(decoded)) return null;
  return decoded;
}

/**
 * Returns an https URL Meta can fetch, or null when the image cannot be sent.
 */
export function toWhatsAppFetchableProductImageUrl(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  if (PUBLIC_HTTPS.test(trimmed) && !LOCAL_HTTPS_HOST.test(trimmed)) {
    return trimmed;
  }

  const objectPath = companyBrandingObjectPath(trimmed);
  if (!objectPath) return null;

  const base = publicWebhookBaseUrl(env);
  if (!base) return null;

  const encoded = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/api/public/company-branding/${encoded}`;
}
