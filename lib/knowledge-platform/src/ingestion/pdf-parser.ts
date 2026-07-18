import { getDocument, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { KnowledgeParseError } from "../errors.js";
import type { ParsedDocument, ParsedPage, ParserInput } from "../types.js";
import { decodeParserContent, normalizeWhitespace } from "../utils/knowledge-utils.js";
import type { Parser } from "./ingestion-contracts.js";

function extractPdfMetadata(info: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!info) return {};

  const metadata: Record<string, unknown> = {};
  const title = info.Title;
  const author = info.Author;
  const subject = info.Subject;
  const creator = info.Creator;
  const producer = info.Producer;
  const creationDate = info.CreationDate;
  const modDate = info.ModDate;

  if (typeof title === "string" && title.trim()) metadata.pdf_title = title.trim();
  if (typeof author === "string" && author.trim()) metadata.pdf_author = author.trim();
  if (typeof subject === "string" && subject.trim()) metadata.pdf_subject = subject.trim();
  if (typeof creator === "string" && creator.trim()) metadata.pdf_creator = creator.trim();
  if (typeof producer === "string" && producer.trim()) metadata.pdf_producer = producer.trim();
  if (typeof creationDate === "string") metadata.pdf_creation_date = creationDate;
  if (typeof modDate === "string") metadata.pdf_modification_date = modDate;

  return metadata;
}

async function extractPageText(page: PDFPageProxy): Promise<string> {
  const textContent = await page.getTextContent();
  return normalizeWhitespace(
    textContent.items
      .map((item) => (typeof item === "object" && item !== null && "str" in item ? String(item.str) : ""))
      .join(" "),
  );
}

export class PdfParser implements Parser {
  supports(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return normalized === "application/pdf" || normalized === "application/x-pdf";
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    if (!this.supports(input.mimeType)) {
      throw new KnowledgeParseError(`PdfParser does not support mime type ${input.mimeType}.`);
    }

    let bytes: Uint8Array;
    try {
      bytes = decodeParserContent(input);
    } catch (error) {
      throw new KnowledgeParseError(
        error instanceof Error ? error.message : "Failed to decode PDF content.",
      );
    }

    try {
      const pdf = await getDocument({
        data: bytes,
        useSystemFonts: true,
      }).promise;

      const pages: ParsedPage[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const text = await extractPageText(page);
        pages.push({
          pageNumber,
          title: `Page ${pageNumber}`,
          text,
        });
      }

      const metadataResult = await pdf.getMetadata();
      const pdfMetadata = extractPdfMetadata(metadataResult?.info as Record<string, unknown> | undefined);
      const resolvedTitle =
        input.title?.trim() ||
        (typeof pdfMetadata.pdf_title === "string" ? pdfMetadata.pdf_title : undefined) ||
        input.fileName?.replace(/\.pdf$/i, "") ||
        "Untitled PDF";

      const fullText = normalizeWhitespace(pages.map((page) => page.text).filter(Boolean).join("\n\n"));

      return {
        title: resolvedTitle,
        text: fullText,
        mimeType: "application/pdf",
        metadata: {
          ...pdfMetadata,
          parser: "pdf",
          page_count: pdf.numPages,
          file_name: input.fileName ?? null,
        },
        pages: pages.length > 0 ? pages : undefined,
      };
    } catch (error) {
      throw new KnowledgeParseError(
        error instanceof Error ? error.message : "Failed to parse PDF document.",
      );
    }
  }
}
