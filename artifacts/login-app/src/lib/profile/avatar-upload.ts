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

function resolveSupabaseUrl(): string {
  const url = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl;
  if (url) return url.replace(/\/$/, "");
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!envUrl) throw new AvatarUploadError("missing_key", "Supabase URL unavailable");
  return envUrl.replace(/\/$/, "");
}

async function resolveAuthenticatedUploadToken(expectedUserId: string): Promise<string> {
  let authResult = await supabase.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    await supabase.auth.refreshSession();
    authResult = await supabase.auth.getUser();
  }

  const authUser = authResult.data.user;
  if (!authUser) {
    throw new AvatarUploadError("unauthenticated");
  }

  if (authUser.id !== expectedUserId) {
    throw new AvatarUploadError("forbidden", "Profile user mismatch");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new AvatarUploadError("unauthenticated");
  }

  return token;
}

async function uploadAvatarObject(input: {
  objectPath: string;
  file: File;
  contentType: string;
  accessToken: string;
}): Promise<void> {
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!apikey) {
    throw new AvatarUploadError("missing_key");
  }

  const endpoint = `${resolveSupabaseUrl()}/storage/v1/object/${AVATAR_STORAGE_BUCKET}/${input.objectPath}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("Authorization", `Bearer ${input.accessToken}`);
    xhr.setRequestHeader("apikey", apikey);
    xhr.setRequestHeader("Content-Type", input.contentType);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }

      let detail = xhr.responseText || `Upload failed (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        detail = parsed.message || parsed.error || detail;
      } catch {
        /* keep raw response */
      }

      if (xhr.status === 403 || /row-level security|unauthorized|jwt/i.test(detail)) {
        reject(new AvatarUploadError("forbidden", detail));
        return;
      }
      if (xhr.status === 401) {
        reject(new AvatarUploadError("unauthenticated", detail));
        return;
      }
      reject(new AvatarUploadError("upload_failed", detail));
    };
    xhr.onerror = () => reject(new AvatarUploadError("network"));
    xhr.send(input.file);
  });
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

  if (!isStorageAvatarPath(storagePath)) {
    throw new AvatarUploadError("invalid_path");
  }

  const accessToken = await resolveAuthenticatedUploadToken(userId);
  await uploadAvatarObject({
    objectPath,
    file,
    contentType: file.type || "image/jpeg",
    accessToken,
  });

  return storagePath;
}
