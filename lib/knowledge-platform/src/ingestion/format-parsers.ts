import type { ParsedDocument, ParserInput } from "../types.js";
import { normalizeWhitespace } from "../utils/knowledge-utils.js";
import type { Parser } from "./ingestion-contracts.js";

export class MarkdownParser implements Parser {
  supports(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return normalized === "text/markdown" || normalized === "text/x-markdown";
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const text = normalizeWhitespace(input.content);
    const titleMatch = text.match(/^#\s+(.+)$/m);
    return {
      title: input.title ?? titleMatch?.[1] ?? "Markdown Document",
      text,
      mimeType: "text/markdown",
      metadata: { parser: "markdown", file_name: input.fileName ?? null },
    };
  }
}

export class HtmlParser implements Parser {
  supports(mimeType: string): boolean {
    return mimeType.toLowerCase() === "text/html";
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const stripped = input.content
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    const text = normalizeWhitespace(stripped);
    const titleMatch = input.content.match(/<title[^>]*>([^<]+)<\/title>/i);
    return {
      title: input.title ?? titleMatch?.[1]?.trim() ?? "HTML Document",
      text,
      mimeType: "text/html",
      metadata: { parser: "html", file_name: input.fileName ?? null },
    };
  }
}

export class CsvParser implements Parser {
  supports(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return normalized === "text/csv" || normalized === "application/csv";
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const lines = input.content.split(/\r?\n/).filter((line) => line.trim());
    const header = lines[0]?.split(",").map((cell) => cell.trim()) ?? [];
    const rows = lines.slice(1).map((line, index) => {
      const cells = line.split(",").map((cell) => cell.trim());
      return `Row ${index + 1}: ${header.map((h, i) => `${h}=${cells[i] ?? ""}`).join("; ")}`;
    });
    const text = normalizeWhitespace([`Columns: ${header.join(", ")}`, ...rows].join("\n"));
    return {
      title: input.title ?? "CSV Document",
      text,
      mimeType: "text/csv",
      metadata: { parser: "csv", row_count: rows.length, file_name: input.fileName ?? null },
    };
  }
}

/** Minimal DOCX parser — extracts text from word/document.xml without external deps. */
export class DocxParser implements Parser {
  supports(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return (
      normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      normalized === "application/msword"
    );
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const isXml = input.content.includes("<w:t");
    const text = isXml
      ? normalizeWhitespace(
          [...input.content.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
            .map((match) => match[1])
            .join(" "),
        )
      : normalizeWhitespace(input.content);
    return {
      title: input.title ?? "Word Document",
      text,
      mimeType: input.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      metadata: { parser: "docx", file_name: input.fileName ?? null, ocr_ready: true },
    };
  }
}
