/**
 * Avatar URL helpers — supports legacy data URLs, HTTPS URLs, and future Storage paths.
 */

export const AVATAR_STORAGE_BUCKET = "avatars" as const;
export const AVATAR_STORAGE_PATH_PREFIX = `${AVATAR_STORAGE_BUCKET}/` as const;
export const AVATAR_MAX_INLINE_BYTES = 512 * 1024;

const BLOCKED_PROTOCOL_PATTERN = /^(javascript|data:text|vbscript|file|blob):/i;
const HTTP_URL_PATTERN = /^https?:\/\/[^\s<>"{}|\\^`[\]]+$/i;
const DATA_IMAGE_PATTERN = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/;
const STORAGE_PATH_PATTERN = /^avatars\/[a-zA-Z0-9/_.-]+$/;

export function isStorageAvatarPath(value: string): boolean {
  return STORAGE_PATH_PATTERN.test(value.trim());
}

export function buildStorageAvatarPath(userId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${AVATAR_STORAGE_PATH_PREFIX}${userId}/${safeName}`;
}

export function resolveAvatarDisplayUrl(
  avatarUrl: string | null | undefined,
  getPublicStorageUrl?: (path: string) => string,
): string | undefined {
  const trimmed = avatarUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isStorageAvatarPath(trimmed) && getPublicStorageUrl) {
    return getPublicStorageUrl(trimmed);
  }

  return trimmed;
}

export function isValidAvatarUrl(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.length > 750_000) {
    return false;
  }

  if (BLOCKED_PROTOCOL_PATTERN.test(trimmed)) {
    return false;
  }

  if (STORAGE_PATH_PATTERN.test(trimmed)) {
    return true;
  }

  if (DATA_IMAGE_PATTERN.test(trimmed)) {
    return true;
  }

  if (HTTP_URL_PATTERN.test(trimmed)) {
    return true;
  }

  return false;
}

export function normalizeAvatarUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (!isValidAvatarUrl(trimmed)) {
    return null;
  }

  return trimmed;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}
