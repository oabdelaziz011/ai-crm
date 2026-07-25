import type { ParsedDocument, ParserInput } from "../types.js";
import type { Parser } from "./ingestion-contracts.js";
import { PlainTextParser } from "./ingestion-contracts.js";

export class ParserRegistry implements Parser {
  private readonly plainTextParser = new PlainTextParser();
  private pdfParser: Parser | null = null;
  private readonly parsers: Parser[] | null;

  constructor(parsers?: Parser[]) {
    this.parsers = parsers ?? null;
  }

  private async resolvePdfParser(): Promise<Parser> {
    if (!this.pdfParser) {
      const { PdfParser } = await import("./pdf-parser.js");
      this.pdfParser = new PdfParser();
    }
    return this.pdfParser;
  }

  private async resolveParsers(): Promise<Parser[]> {
    if (this.parsers) {
      return this.parsers;
    }

    return [await this.resolvePdfParser(), this.plainTextParser];
  }

  supports(_mimeType: string): boolean {
    return true;
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const mimeType = (input.mimeType || "text/plain").toLowerCase();
    const parsers = await this.resolveParsers();
    const parser = parsers.find((candidate) => candidate.supports(mimeType)) ?? this.plainTextParser;
    return parser.parse(input);
  }
}
