const MAX_BYTES = 26_214_400;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

export type AttachmentDecision =
  | { ok: true; mime: string }
  | { ok: false; code: "file_too_large" | "file_type" | "file_name" };

export function decideAttachment(input: { bytes: number; mime: string; fileName?: string }): AttachmentDecision {
  const mime = input.mime.trim().toLowerCase();
  const fileName = input.fileName?.trim() ?? "";
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    return { ok: false, code: "file_name" };
  }
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > MAX_BYTES) {
    return { ok: false, code: "file_too_large" };
  }
  if (!ALLOWED.has(mime)) return { ok: false, code: "file_type" };
  return { ok: true, mime };
}

export type UploadHandle = {
  promise: Promise<void>;
  cancel: () => void;
};

export function uploadStorageObject(input: {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  bucket: string;
  path: string;
  mime: string;
  body: Blob;
  onProgress?: (ratio: number) => void;
}): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("POST", `${input.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${input.bucket}/${input.path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${input.accessToken}`);
    xhr.setRequestHeader("apikey", input.publishableKey);
    xhr.setRequestHeader("Content-Type", input.mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) input.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("upload_failed"));
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("cancelled"));
    xhr.send(input.body);
  });
  return { promise, cancel: () => xhr.abort() };
}
