import {
  AVATAR_MAX_INLINE_BYTES,
  AVATAR_STORAGE_BUCKET,
  buildStorageAvatarPath,
  isStorageAvatarPath,
} from "@/lib/avatar-url";
import { supabase } from "@/lib/supabase";

export type AvatarUploadErrorCode =
  | "unsupported_type"
  | "empty"
  | "too_large"
  | "unauthenticated"
  | "missing_key"
  | "forbidden"
  | "upload_failed"
  | "invalid_path"
  | "network";

export class AvatarUploadError extends Error {
  readonly code: AvatarUploadErrorCode;

  constructor(code: AvatarUploadErrorCode, detail?: string) {
    super(detail || code);
    this.name = "AvatarUploadError";
    this.code = code;
  }
}

/** Object path inside the `avatars` bucket (without bucket prefix). */
export function avatarStorageObjectPath(avatarUrl: string): string {
  const trimmed = avatarUrl.trim();
  if (trimmed.startsWith(`${AVATAR_STORAGE_BUCKET}/`)) {
    return trimmed.slice(AVATAR_STORAGE_BUCKET.length + 1);
  }
  return trimmed;
}

export function getAvatarPublicUrl(avatarUrl: string): string {
  const objectPath = avatarStorageObjectPath(avatarUrl);
  const { data } = supabase.storage.from(AVATAR_STORAGE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

function classifyStorageError(message: string, status?: number): AvatarUploadErrorCode {
  const detail = message || "";
  if (status === 401 || /jwt|not authenticated|session/i.test(detail)) {
    return "unauthenticated";
  }
  if (status === 403 || /row-level security|unauthorized|permission|forbidden|policy/i.test(detail)) {
    return "forbidden";
  }
  return "upload_failed";
}

async function resolveAuthenticatedUserId(expectedUserId?: string): Promise<string> {
  let authResult = await supabase.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    await supabase.auth.refreshSession();
    authResult = await supabase.auth.getUser();
  }

  const authUser = authResult.data.user;
  if (!authUser) {
    throw new AvatarUploadError("unauthenticated");
  }

  if (expectedUserId && authUser.id !== expectedUserId) {
    throw new AvatarUploadError("forbidden", "Profile user mismatch");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    throw new AvatarUploadError("unauthenticated");
  }

  return authUser.id;
}

/**
 * Upload a profile photo to the public `avatars` bucket.
 * Returns the storage path stored in `profiles.avatar_url` (`avatars/{userId}/…`).
 *
 * Uses a unique object path (no upsert) so INSERT-only RLS is enough; still
 * requires the caller to own `{auth.uid()}/…` under the avatars bucket.
 */
export async function uploadProfileAvatar(file: File, userId?: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new AvatarUploadError("unsupported_type");
  }
  if (file.size <= 0) {
    throw new AvatarUploadError("empty");
  }
  // Keep UX limit aligned with profile form copy; storage bucket allows up to 2MB.
  if (file.size > AVATAR_MAX_INLINE_BYTES) {
    throw new AvatarUploadError("too_large");
  }

  const authUserId = await resolveAuthenticatedUserId(userId);

  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    (file.type === "image/png" ? "png" : "jpg");
  const storagePath = buildStorageAvatarPath(authUserId, `avatar-${Date.now()}.${ext}`);
  const objectPath = avatarStorageObjectPath(storagePath);

  if (!isStorageAvatarPath(storagePath)) {
    throw new AvatarUploadError("invalid_path");
  }

  const { error } = await supabase.storage.from(AVATAR_STORAGE_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });

  if (error) {
    const status =
      typeof (error as { statusCode?: string | number }).statusCode !== "undefined"
        ? Number((error as { statusCode?: string | number }).statusCode)
        : undefined;
    throw new AvatarUploadError(classifyStorageError(error.message, status), error.message);
  }

  return storagePath;
}
