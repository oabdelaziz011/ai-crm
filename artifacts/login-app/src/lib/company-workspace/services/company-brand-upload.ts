import { supabase } from "@/lib/supabase";

export const COMPANY_BRANDING_BUCKET = "company-branding";
export const COMPANY_BRAND_MAX_BYTES = 5 * 1024 * 1024;

export type BrandUploadErrorCode =
  | "empty"
  | "unsupported_type"
  | "too_large"
  | "unauthenticated"
  | "missing_key"
  | "bucket_missing"
  | "forbidden"
  | "payload_too_large"
  | "mime_rejected"
  | "network"
  | "unknown";

export class BrandUploadError extends Error {
  readonly code: BrandUploadErrorCode;

  constructor(code: BrandUploadErrorCode, detail?: string) {
    super(detail || code);
    this.name = "BrandUploadError";
    this.code = code;
  }
}

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+\s]/g, "_").slice(0, 120);
}

function resolveMime(file: File): string | null {
  if (file.type && ALLOWED_MIME.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const guessed = EXT_MIME[ext];
  return guessed && ALLOWED_MIME.has(guessed) ? guessed : null;
}

function resolveSupabaseUrl(): string {
  const url = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl;
  if (url) return url.replace(/\/$/, "");
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!envUrl) throw new BrandUploadError("unknown", "Supabase URL unavailable");
  return envUrl.replace(/\/$/, "");
}

export function validateCompanyBrandImage(
  file: File,
): { ok: true } | { ok: false; code: BrandUploadErrorCode } {
  if (!file || file.size <= 0) return { ok: false, code: "empty" };
  if (!resolveMime(file)) return { ok: false, code: "unsupported_type" };
  if (file.size > COMPANY_BRAND_MAX_BYTES) return { ok: false, code: "too_large" };
  return { ok: true };
}

export function getCompanyBrandPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(COMPANY_BRANDING_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Extract storage object path from a public company-branding URL. */
export function extractCompanyBrandStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${COMPANY_BRANDING_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0] ?? "");
  return path.trim() || null;
}

export async function removeCompanyBrandObject(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(COMPANY_BRANDING_BUCKET).remove([storagePath]);
  if (error) throw new BrandUploadError("unknown", error.message || "Failed to remove brand asset");
}

export async function removeCompanyBrandPublicUrl(publicUrl: string | null | undefined): Promise<void> {
  const path = extractCompanyBrandStoragePath(publicUrl);
  if (!path) return;
  try {
    await removeCompanyBrandObject(path);
  } catch {
    /* best-effort cleanup — draft save may still clear the URL */
  }
}

/**
 * Reuses the same XHR + progress upload pattern as entity-file-upload,
 * targeting the public company-branding bucket (no new upload module).
 */
export async function uploadCompanyBrandAsset(input: {
  companyId: string;
  slot: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<{ storagePath: string; publicUrl: string; mimeType: string }> {
  const validation = validateCompanyBrandImage(input.file);
  if (!validation.ok) throw new BrandUploadError(validation.code);

  const mimeType = resolveMime(input.file);
  if (!mimeType) throw new BrandUploadError("unsupported_type");

  const fileId = crypto.randomUUID();
  const storagePath = `${input.companyId}/${input.slot}/${fileId}-${sanitizeFileName(input.file.name)}`;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new BrandUploadError("unauthenticated");

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!apikey) throw new BrandUploadError("missing_key");

  const endpoint = `${resolveSupabaseUrl()}/storage/v1/object/${COMPANY_BRANDING_BUCKET}/${storagePath}`;

  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", apikey);
      xhr.setRequestHeader("Content-Type", mimeType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
        input.onProgress?.(percent);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          input.onProgress?.(100);
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
        if (xhr.status === 404 || /bucket|not found/i.test(detail)) {
          reject(new BrandUploadError("bucket_missing", detail));
          return;
        }
        if (xhr.status === 403 || /row-level security|unauthorized|jwt/i.test(detail)) {
          reject(new BrandUploadError("forbidden", detail));
          return;
        }
        if (xhr.status === 413 || /payload|too large|size/i.test(detail)) {
          reject(new BrandUploadError("payload_too_large", detail));
          return;
        }
        if (/mime|content.type|not supported/i.test(detail)) {
          reject(new BrandUploadError("mime_rejected", detail));
          return;
        }
        reject(new BrandUploadError("unknown", detail));
      };
      xhr.onerror = () => reject(new BrandUploadError("network"));
      xhr.send(input.file);
    });
  } catch (error) {
    try {
      await removeCompanyBrandObject(storagePath);
    } catch {
      /* ignore */
    }
    throw error;
  }

  return {
    storagePath,
    publicUrl: getCompanyBrandPublicUrl(storagePath),
    mimeType,
  };
}
