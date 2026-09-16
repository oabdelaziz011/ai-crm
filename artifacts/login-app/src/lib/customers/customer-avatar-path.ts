export const CUSTOMER_AVATARS_BUCKET = "customer-avatars" as const;

export type CustomerAvatarValidationCode =
  | "empty"
  | "unsupported_type"
  | "too_large";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function resolveCustomerAvatarMime(file: {
  type?: string;
  name?: string;
}): string | null {
  if (file.type && ALLOWED_MIME.has(file.type)) return file.type;
  const ext = file.name?.split(".").pop()?.toLowerCase() ?? "";
  const guessed = EXT_MIME[ext];
  return guessed && ALLOWED_MIME.has(guessed) ? guessed : null;
}

export function extensionForCustomerAvatarMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export function validateCustomerAvatarImage(
  file: { type?: string; name?: string; size: number },
  maxBytes: number,
): { ok: true; mimeType: string } | { ok: false; code: CustomerAvatarValidationCode } {
  if (!file || file.size <= 0) return { ok: false, code: "empty" };
  const mimeType = resolveCustomerAvatarMime(file);
  if (!mimeType) return { ok: false, code: "unsupported_type" };
  if (file.size > maxBytes) return { ok: false, code: "too_large" };
  return { ok: true, mimeType };
}

/** Build tenant-owned object path: company_id/customers/customer_id/avatar-<ts>.<ext> */
export function buildCustomerAvatarObjectPath(input: {
  companyId: string;
  customerId: string;
  mimeType: string;
  now?: number;
}): string {
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  if (!companyId || companyId.includes("/") || companyId.includes("..")) {
    throw new Error("Invalid company id");
  }
  if (!customerId || customerId.includes("/") || customerId.includes("..")) {
    throw new Error("Invalid customer id");
  }
  const ext = extensionForCustomerAvatarMime(input.mimeType);
  const stamp = input.now ?? Date.now();
  return `${companyId}/customers/${customerId}/avatar-${stamp}.${ext}`;
}

/** Extract object path from a customer-avatars public URL (best-effort). */
export function extractCustomerAvatarStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const trimmed = publicUrl.trim();
  if (!trimmed) return null;

  const marker = `/storage/v1/object/public/${CUSTOMER_AVATARS_BUCKET}/`;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) {
    if (/^[0-9a-f-]{36}\/customers\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]+$/i.test(trimmed)) {
      return trimmed;
    }
    return null;
  }
  const path = decodeURIComponent(trimmed.slice(idx + marker.length).split("?")[0]?.split("#")[0] ?? "");
  return path.trim() || null;
}

export function isOwnedCustomerAvatarUrl(input: {
  companyId: string;
  customerId: string;
  avatarUrl: string | null | undefined;
}): boolean {
  const url = input.avatarUrl?.trim();
  if (!url) return true;
  const path = extractCustomerAvatarStoragePath(url);
  if (!path) return false;
  const expectedPrefix = `${input.companyId}/customers/${input.customerId}/`;
  if (!path.startsWith(expectedPrefix)) return false;
  const filename = path.slice(expectedPrefix.length);
  return /^[a-zA-Z0-9._-]+$/.test(filename) && !filename.includes("/");
}
