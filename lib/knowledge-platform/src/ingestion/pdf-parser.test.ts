import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { KnowledgeParseError } from "../errors.js";
import { ParserRegistry } from "./parser-registry.js";
import { PdfParser } from "./pdf-parser.js";
import { PlainTextParser } from "./ingestion-contracts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePdfBase64 = readFileSync(resolve(__dirname, "../test-fixtures/sample.pdf"), "base64");

describe("PlainTextParser", () => {
  it("normalizes plain text content", async () => {
    const parser = new PlainTextParser();
    const parsed = await parser.parse({
      content: "  Hello   world  ",
      mimeType: "text/plain",
      title: "Greeting",
    });

    assert.equal(parsed.title, "Greeting");
    assert.equal(parsed.text, "Hello world");
    assert.equal(parsed.metadata?.parser, "plain_text");
  });
});

describe("PdfParser", () => {
  it("parses a PDF buffer and extracts page metadata", async () => {
    const parser = new PdfParser();
    const parsed = await parser.parse({
      content: samplePdfBase64,
      mimeType: "application/pdf",
      contentEncoding: "base64",
      fileName: "sample.pdf",
      title: "Sample Policy",
    });

    assert.equal(parsed.mimeType, "application/pdf");
    assert.equal(parsed.metadata?.parser, "pdf");
    assert.ok(typeof parsed.metadata?.page_count === "number");
    assert.ok(parsed.text.length > 0);
    assert.ok(parsed.pages && parsed.pages.length >= 1);
    assert.match(parsed.text, /VaultOS/i);
  });

  it("rejects invalid PDF content", async () => {
    const parser = new PdfParser();
    await assert.rejects(
      () =>
        parser.parse({
          content: Buffer.from("not-a-pdf").toString("base64"),
          mimeType: "application/pdf",
          contentEncoding: "base64",
          fileName: "broken.pdf",
        }),
      KnowledgeParseError,
    );
  });
});

describe("ParserRegistry", () => {
  it("routes PDF mime types to the PDF parser", async () => {
    const registry = new ParserRegistry();
    const parsed = await registry.parse({
      content: samplePdfBase64,
      mimeType: "application/pdf",
      contentEncoding: "base64",
      fileName: "sample.pdf",
    });

    assert.equal(parsed.metadata?.parser, "pdf");
  });

  it("routes plain text mime types to the text parser", async () => {
    const registry = new ParserRegistry();
    const parsed = await registry.parse({
      content: "Simple text",
      mimeType: "text/plain",
      title: "Note",
    });

    assert.equal(parsed.metadata?.parser, "plain_text");
    assert.equal(parsed.text, "Simple text");
  });
});
