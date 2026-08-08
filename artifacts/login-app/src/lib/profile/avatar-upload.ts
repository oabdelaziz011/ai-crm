import {
  AVATAR_MAX_INLINE_BYTES,
  AVATAR_STORAGE_BUCKET,
  buildStorageAvatarPath,
  isStorageAvatarPath,
} from "@/lib/avatar-url";
import { supabase } from "@/lib/supabase";

export class AvatarUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarUploadError";
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

/**
 * Upload a profile photo to the public `avatars` bucket.
 * Returns the storage path stored in `profiles.avatar_url` (`avatars/{userId}/…`).
 */
export async function uploadProfileAvatar(file: File, userId: string): Promise<string> {
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

  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    (file.type === "image/png" ? "png" : "jpg");
  const storagePath = buildStorageAvatarPath(userId, `avatar-${Date.now()}.${ext}`);
  const objectPath = avatarStorageObjectPath(storagePath);

  const { error } = await supabase.storage.from(AVATAR_STORAGE_BUCKET).upload(objectPath, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
    cacheControl: "3600",
  });

  if (error) {
    throw new AvatarUploadError(error.message || "upload_failed");
  }

  if (!isStorageAvatarPath(storagePath)) {
    throw new AvatarUploadError("invalid_path");
  }

  return storagePath;
}
