import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/test-fixtures");
mkdirSync(dir, { recursive: true });

const pages = [
  { title: "Page One — Overview", body: "VaultOS multi-page verification. Section alpha content." },
  { title: "Page Two — Policies", body: "Enterprise policy handbook excerpt for page two." },
  { title: "Page Three — Appendix", body: "Appendix material and closing notes for page three." },
];

const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

for (const pageSpec of pages) {
  const page = pdfDoc.addPage([612, 792]);
  page.drawText(pageSpec.title, { x: 72, y: 720, size: 16, font });
  page.drawText(pageSpec.body, { x: 72, y: 690, size: 12, font });
}

const bytes = await pdfDoc.save();
writeFileSync(resolve(dir, "sample-multipage.pdf"), bytes);
console.log("sample-multipage.pdf written", bytes.length, "bytes,", pages.length, "pages");
