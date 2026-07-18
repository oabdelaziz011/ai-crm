import type { ImportedDocumentPayload, KnowledgeSourceRecord, ParsedDocument, ParserInput } from "../types.js";
import { normalizeWhitespace } from "../utils/knowledge-utils.js";

export interface Parser {
  supports(mimeType: string): boolean;
  parse(input: ParserInput): Promise<ParsedDocument>;
}

export class PlainTextParser implements Parser {
  supports(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return (
      normalized.startsWith("text/") ||
      normalized === "application/json" ||
      normalized === "application/xml" ||
      normalized === "application/octet-stream"
    );
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    return {
      title: input.title ?? "Untitled Document",
      text: normalizeWhitespace(input.content),
      mimeType: input.mimeType || "text/plain",
      metadata: {
        parser: "plain_text",
        file_name: input.fileName ?? null,
      },
    };
  }
}

export interface KnowledgeSourceAdapter {
  readonly sourceType: KnowledgeSourceRecord["source_type"];
  validateConfiguration(configuration: Record<string, unknown>): { valid: boolean; errors: string[] };
}

export class ManualKnowledgeSourceAdapter implements KnowledgeSourceAdapter {
  readonly sourceType = "manual" as const;

  validateConfiguration(): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}

export class PdfKnowledgeSourceAdapter implements KnowledgeSourceAdapter {
  readonly sourceType = "pdf" as const;

  validateConfiguration(): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}

export interface DocumentImporter {
  importDocument(input: {
    source: KnowledgeSourceRecord;
    payload: ImportedDocumentPayload;
  }): Promise<ImportedDocumentPayload>;
}

export class PassthroughDocumentImporter implements DocumentImporter {
  async importDocument(input: {
    source: KnowledgeSourceRecord;
    payload: ImportedDocumentPayload;
  }): Promise<ImportedDocumentPayload> {
    void input.source;
    return input.payload;
  }
}
