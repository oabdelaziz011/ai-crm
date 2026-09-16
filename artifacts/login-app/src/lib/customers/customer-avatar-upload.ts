import { AVATAR_MAX_INLINE_BYTES } from "@/lib/avatar-url";
import { supabase } from "@/lib/supabase";
import {
  CUSTOMER_AVATARS_BUCKET,
  buildCustomerAvatarObjectPath,
  extractCustomerAvatarStoragePath,
  isOwnedCustomerAvatarUrl,
  validateCustomerAvatarImage,
} from "@/lib/customers/customer-avatar-path";

export {
  CUSTOMER_AVATARS_BUCKET,
  buildCustomerAvatarObjectPath,
  extractCustomerAvatarStoragePath,
  isOwnedCustomerAvatarUrl,
  validateCustomerAvatarImage,
} from "@/lib/customers/customer-avatar-path";

export const CUSTOMER_AVATAR_MAX_BYTES = AVATAR_MAX_INLINE_BYTES;

export type CustomerAvatarUploadErrorCode =
  | "empty"
  | "unsupported_type"
  | "too_large"
  | "unauthenticated"
  | "missing_key"
  | "forbidden"
  | "invalid_path"
  | "company_required"
  | "customer_required"
  | "upload_failed"
  | "persist_failed"
  | "network";

export class CustomerAvatarUploadError extends Error {
  readonly code: CustomerAvatarUploadErrorCode;

  constructor(code: CustomerAvatarUploadErrorCode, detail?: string) {
    super(detail || code);
    this.name = "CustomerAvatarUploadError";
    this.code = code;
  }
}

function resolveSupabaseUrl(): string {
  const url = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl;
  if (url) return url.replace(/\/$/, "");
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!envUrl) throw new CustomerAvatarUploadError("upload_failed", "Supabase URL unavailable");
  return envUrl.replace(/\/$/, "");
}

export function getCustomerAvatarPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(CUSTOMER_AVATARS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function removeCustomerAvatarObject(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(CUSTOMER_AVATARS_BUCKET).remove([storagePath]);
  if (error) {
    throw new CustomerAvatarUploadError("upload_failed", error.message || "Failed to remove avatar object");
  }
}

function validateOrThrow(file: File) {
  const validation = validateCustomerAvatarImage(file, CUSTOMER_AVATAR_MAX_BYTES);
  if (!validation.ok) throw new CustomerAvatarUploadError(validation.code);
  return validation;
}

async function uploadCustomerAvatarObject(input: {
  companyId: string;
  customerId: string;
  file: File;
}): Promise<{ storagePath: string; publicUrl: string }> {
  const validation = validateOrThrow(input.file);

  let storagePath: string;
  try {
    storagePath = buildCustomerAvatarObjectPath({
      companyId: input.companyId,
      customerId: input.customerId,
      mimeType: validation.mimeType,
    });
  } catch (error) {
    throw new CustomerAvatarUploadError(
      "invalid_path",
      error instanceof Error ? error.message : "Invalid path",
    );
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new CustomerAvatarUploadError("unauthenticated");

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!apikey) throw new CustomerAvatarUploadError("missing_key");

  const endpoint = `${resolveSupabaseUrl()}/storage/v1/object/${CUSTOMER_AVATARS_BUCKET}/${storagePath}`;

  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", apikey);
      xhr.setRequestHeader("Content-Type", validation.mimeType);
      xhr.setRequestHeader("x-upsert", "false");
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
          /* keep raw */
        }
        if (xhr.status === 401 || /jwt|not authenticated|session/i.test(detail)) {
          reject(new CustomerAvatarUploadError("unauthenticated", detail));
          return;
        }
        if (xhr.status === 403 || /row-level security|unauthorized|permission|forbidden|policy/i.test(detail)) {
          reject(new CustomerAvatarUploadError("forbidden", detail));
          return;
        }
        reject(new CustomerAvatarUploadError("upload_failed", detail));
      };
      xhr.onerror = () => reject(new CustomerAvatarUploadError("network"));
      xhr.send(input.file);
    });
  } catch (error) {
    try {
      await removeCustomerAvatarObject(storagePath);
    } catch {
      /* ignore orphan cleanup failure */
    }
    throw error;
  }

  return {
    storagePath,
    publicUrl: getCustomerAvatarPublicUrl(storagePath),
  };
}

/**
 * Upload a new CRM customer avatar, persist `customers.avatar_url`, then best-effort
 * delete the previous object. Existing avatar is preserved until DB update succeeds.
 */
export async function uploadAndPersistCustomerAvatar(input: {
  companyId: string;
  customerId: string;
  file: File;
  previousAvatarUrl?: string | null;
}): Promise<{ avatarUrl: string }> {
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  if (!companyId) throw new CustomerAvatarUploadError("company_required");
  if (!customerId) throw new CustomerAvatarUploadError("customer_required");

  const uploaded = await uploadCustomerAvatarObject({
    companyId,
    customerId,
    file: input.file,
  });

  if (
    !isOwnedCustomerAvatarUrl({
      companyId,
      customerId,
      avatarUrl: uploaded.publicUrl,
    })
  ) {
    try {
      await removeCustomerAvatarObject(uploaded.storagePath);
    } catch {
      /* ignore */
    }
    throw new CustomerAvatarUploadError("invalid_path", "Uploaded avatar path failed ownership check");
  }

  const { data, error } = await supabase
    .from("customers")
    .update({ avatar_url: uploaded.publicUrl })
    .eq("id", customerId)
    .eq("company_id", companyId)
    .select("id, avatar_url")
    .maybeSingle();

  if (error || !data?.id) {
    try {
      await removeCustomerAvatarObject(uploaded.storagePath);
    } catch {
      /* ignore */
    }
    throw new CustomerAvatarUploadError(
      "persist_failed",
      error?.message || "Failed to persist customer avatar",
    );
  }

  const previousPath = extractCustomerAvatarStoragePath(input.previousAvatarUrl);
  if (previousPath && previousPath !== uploaded.storagePath) {
    try {
      await removeCustomerAvatarObject(previousPath);
    } catch {
      /* orphan cleanup best-effort — new URL is already active */
    }
  }

  return { avatarUrl: uploaded.publicUrl };
}

/**
 * Clear `customers.avatar_url` first, then best-effort delete the owned object.
 * If object deletion fails, the active avatar URL remains cleared.
 */
export async function removeAndPersistCustomerAvatar(input: {
  companyId: string;
  customerId: string;
  previousAvatarUrl?: string | null;
}): Promise<void> {
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  if (!companyId) throw new CustomerAvatarUploadError("company_required");
  if (!customerId) throw new CustomerAvatarUploadError("customer_required");

  const { data, error } = await supabase
    .from("customers")
    .update({ avatar_url: null })
    .eq("id", customerId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    throw new CustomerAvatarUploadError(
      "persist_failed",
      error?.message || "Failed to clear customer avatar",
    );
  }

  const previousPath = extractCustomerAvatarStoragePath(input.previousAvatarUrl);
  if (previousPath) {
    try {
      await removeCustomerAvatarObject(previousPath);
    } catch {
      /* orphan cleanup best-effort */
    }
  }
}
