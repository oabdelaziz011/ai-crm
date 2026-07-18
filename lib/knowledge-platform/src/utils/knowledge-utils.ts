import type { ContentEncoding, ParserInput } from "../types.js";
import { ValidationError } from "../errors.js";
import { sha256Hex } from "./sha256.js";

export function computeChecksum(value: string): string {
  return sha256Hex(value);
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, " ").replace(/ +/g, " ").trim();
}

export function decodeParserContent(input: Pick<ParserInput, "content" | "contentEncoding">): Uint8Array {
  const encoding = input.contentEncoding ?? "text";

  if (encoding === "base64") {
    if (!input.content.trim()) {
      throw new ValidationError("Base64 PDF content is empty.");
    }
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(input.content, "base64"));
    }
    const binary = atob(input.content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  return new TextEncoder().encode(input.content);
}

export function buildImportMetadata(
  importedMetadata: Record<string, unknown> | undefined,
  inputMetadata: Record<string, unknown> | undefined,
  details: {
    userId: string | null;
    fileName?: string;
    mimeType?: string;
    pageCount?: number | null;
    parser?: string | null;
  },
): Record<string, unknown> {
  return {
    ...(importedMetadata ?? {}),
    ...(inputMetadata ?? {}),
    import: {
      status: "completed",
      imported_at: new Date().toISOString(),
      imported_by: details.userId,
      file_name: details.fileName ?? null,
      mime_type: details.mimeType ?? null,
      page_count: details.pageCount ?? null,
      parser: details.parser ?? null,
    },
  };
}
