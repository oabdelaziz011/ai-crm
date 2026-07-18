import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "../constants.js";
import type { ChunkDraft } from "../types.js";
import { computeChecksum, estimateTokenCount, normalizeWhitespace } from "../utils/knowledge-utils.js";

export type ChunkingOptions = {
  maxChunkSize?: number;
  overlap?: number;
};

export interface ChunkingStrategy {
  chunk(text: string, options?: ChunkingOptions): ChunkDraft[];
}

export class ParagraphChunkingStrategy implements ChunkingStrategy {
  chunk(text: string, options?: ChunkingOptions): ChunkDraft[] {
    const maxChunkSize = options?.maxChunkSize ?? DEFAULT_CHUNK_SIZE;
    const overlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];

    const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const chunks: ChunkDraft[] = [];
    let buffer = "";
    let chunkOrder = 0;

    const flush = () => {
      const content = buffer.trim();
      if (!content) return;
      chunks.push({
        chunkOrder,
        content,
        tokenCount: estimateTokenCount(content),
        checksum: computeChecksum(content),
      });
      chunkOrder += 1;
      buffer = overlap > 0 ? content.slice(Math.max(0, content.length - overlap)) : "";
    };

    for (const paragraph of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (candidate.length <= maxChunkSize) {
        buffer = candidate;
        continue;
      }

      if (buffer) flush();

      if (paragraph.length <= maxChunkSize) {
        buffer = paragraph;
        continue;
      }

      for (let start = 0; start < paragraph.length; start += maxChunkSize - overlap) {
        const slice = paragraph.slice(start, start + maxChunkSize).trim();
        if (!slice) continue;
        chunks.push({
          chunkOrder,
          content: slice,
          tokenCount: estimateTokenCount(slice),
          checksum: computeChecksum(slice),
        });
        chunkOrder += 1;
      }
      buffer = "";
    }

    flush();
    return chunks;
  }
}
