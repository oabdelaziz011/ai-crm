import { supabase } from "@/lib/supabase";

export const ENTITY_NOTE_ATTACHMENT_BUCKET = "entity-files";

/** Default max size (25 MB). Override via `ENTITY_NOTE_MAX_BYTES` env-backed config if needed. */
export const ENTITY_NOTE_MAX_BYTES = 25 * 1024 * 1024;
export const ENTITY_NOTE_MAX_ATTACHMENTS = 10;

/** Signed URL lifetime for previews/downloads (7 days). */
export const ENTITY_FILE_SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;

export const ENTITY_NOTE_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "scr",
  "msi",
  "dll",
  "ps1",
  "vbs",
  "js",
  "jse",
  "wsf",
  "wsh",
  "jar",
  "apk",
  "dmg",
  "sh",
  "bash",
  "cgi",
  "php",
  "asp",
  "aspx",
  "htm",
  "html",
]);

export type EntityFileValidationCode =
  | "too_many"
  | "unsupported_type"
  | "too_large"
  | "executable"
  | "empty";

export type EntityFileValidationResult =
  | { ok: true; files: File[] }
  | { ok: false; reason: EntityFileValidationCode; message: string };

export type EntityNoteUploadedBinary = {
  storagePath: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  signedUrl: string | null;
};

export function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isExecutableFileName(fileName: string): boolean {
  return BLOCKED_EXTENSIONS.has(fileExtension(fileName));
}

export function resolveEntityNoteMime(file: File): string | null {
  if (isExecutableFileName(file.name)) return null;
  const mime = file.type.toLowerCase();
  if (ENTITY_NOTE_ALLOWED_MIME.has(mime)) return mime;
  const fromExt = EXT_MIME[fileExtension(file.name)];
  return fromExt && ENTITY_NOTE_ALLOWED_MIME.has(fromExt) ? fromExt : null;
}

export function validateEntityNoteFiles(
  files: File[],
  options?: { maxFiles?: number; maxBytes?: number },
): EntityFileValidationResult {
  const maxFiles = options?.maxFiles ?? ENTITY_NOTE_MAX_ATTACHMENTS;
  const maxBytes = options?.maxBytes ?? ENTITY_NOTE_MAX_BYTES;

  if (files.length > maxFiles) {
    return {
      ok: false,
      reason: "too_many",
      message: `You can attach up to ${maxFiles} files.`,
    };
  }

  for (const file of files) {
    if (!file || file.size <= 0) {
      return { ok: false, reason: "empty", message: "One of the selected files is empty." };
    }
    if (isExecutableFileName(file.name)) {
      return {
        ok: false,
        reason: "executable",
        message: `"${file.name}" is not allowed (executable files are blocked).`,
      };
    }
    if (!resolveEntityNoteMime(file)) {
      return {
        ok: false,
        reason: "unsupported_type",
        message: `"${file.name}" is not supported. Use PDF, DOCX, XLSX, JPG, PNG, or WEBP.`,
      };
    }
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return {
        ok: false,
        reason: "too_large",
        message: `"${file.name}" exceeds the ${mb} MB limit.`,
      };
    }
  }

  return { ok: true, files };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+\s]/g, "_").slice(0, 120);
}

function resolveSupabaseUrl(): string {
  const url = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl;
  if (url) return url.replace(/\/$/, "");
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!envUrl) throw new Error("Supabase URL unavailable");
  return envUrl.replace(/\/$/, "");
}

function buildStoragePath(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  activityId: string;
  file: File;
}): string {
  const fileId = crypto.randomUUID();
  return `${input.tenantId}/${input.entityType}/${input.entityId}/${input.activityId}/${fileId}-${sanitizeFileName(input.file.name)}`;
}

export async function createEntityFileSignedUrl(
  storagePath: string,
  expiresIn = ENTITY_FILE_SIGNED_URL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ENTITY_NOTE_ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function removeEntityFileObject(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(ENTITY_NOTE_ATTACHMENT_BUCKET)
    .remove([storagePath]);
  if (error) throw new Error(error.message || "Failed to remove uploaded file");
}

/**
 * Production upload service (no UI).
 * Validates → uploads binary to `entity-files` → returns path + signed URL + metadata.
 * Progress is real XHR upload progress (0–100).
 */
export async function uploadEntityNoteFileWithProgress(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  /** Required for production paths — note/activity id. */
  activityId: string;
  file: File;
  onProgress?: (percent: number) => void;
  maxBytes?: number;
}): Promise<EntityNoteUploadedBinary> {
  const validation = validateEntityNoteFiles([input.file], {
    maxFiles: 1,
    maxBytes: input.maxBytes,
  });
  if (!validation.ok) throw new Error(validation.message);

  const mimeType = resolveEntityNoteMime(input.file);
  if (!mimeType) throw new Error("Unsupported attachment type");

  const activityId = input.activityId.trim();
  if (!activityId) throw new Error("Note id is required before uploading files");

  const storagePath = buildStoragePath({
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    activityId,
    file: input.file,
  });

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!apikey) throw new Error("Supabase key unavailable");

  const endpoint = `${resolveSupabaseUrl()}/storage/v1/object/${ENTITY_NOTE_ATTACHMENT_BUCKET}/${storagePath}`;

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
          reject(new Error("File storage is not configured. Ask an admin to apply migration 235."));
          return;
        }
        if (xhr.status === 403 || /row-level security|unauthorized|jwt/i.test(detail)) {
          reject(new Error("You do not have permission to upload files."));
          return;
        }
        if (xhr.status === 413 || /payload|too large|size/i.test(detail)) {
          reject(new Error("File is too large for storage."));
          return;
        }
        if (/mime|content.type|not supported/i.test(detail)) {
          reject(new Error("This file type is not allowed."));
          return;
        }
        reject(new Error(detail));
      };
      xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
      xhr.send(input.file);
    });
  } catch (error) {
    // Best-effort cleanup if a partial object landed.
    try {
      await removeEntityFileObject(storagePath);
    } catch {
      /* ignore */
    }
    throw error;
  }

  const signedUrl = await createEntityFileSignedUrl(storagePath);

  return {
    storagePath,
    mimeType,
    fileName: input.file.name,
    sizeBytes: input.file.size,
    signedUrl,
  };
}

/** Upload binary after note activity exists. Metadata is written separately via entity_files. */
export async function uploadEntityNoteFile(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  activityId: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<EntityNoteUploadedBinary> {
  return uploadEntityNoteFileWithProgress(input);
}

/** Force a browser download from a signed Storage URL (works cross-origin). */
export async function downloadFromSignedUrl(href: string, fileName: string): Promise<void> {
  const response = await fetch(href);
  if (!response.ok) throw new Error("Download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatAttachmentSize(bytes: number): string | null {
  if (bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function attachmentKind(
  fileType: string,
  fileName: string,
): "image" | "pdf" | "docx" | "xlsx" | "file" {
  if (fileType.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(fileName)) return "image";
  if (fileType.includes("pdf") || /\.pdf$/i.test(fileName)) return "pdf";
  if (fileType.includes("wordprocessingml") || /\.docx$/i.test(fileName)) return "docx";
  if (fileType.includes("spreadsheetml") || /\.xlsx$/i.test(fileName)) return "xlsx";
  return "file";
}
