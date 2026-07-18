import type { ParsedDocument, ParserInput } from "../types.js";
import type { Parser } from "./ingestion-contracts.js";
import { PdfParser } from "./pdf-parser.js";
import { PlainTextParser } from "./ingestion-contracts.js";

export class ParserRegistry implements Parser {
  private readonly plainTextParser = new PlainTextParser();
  private readonly pdfParser = new PdfParser();
  private readonly parsers: Parser[];

  constructor(parsers?: Parser[]) {
    this.parsers = parsers ?? [this.pdfParser, this.plainTextParser];
  }

  supports(_mimeType: string): boolean {
    return true;
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const mimeType = (input.mimeType || "text/plain").toLowerCase();
    const parser = this.parsers.find((candidate) => candidate.supports(mimeType)) ?? this.plainTextParser;
    return parser.parse(input);
  }
}
