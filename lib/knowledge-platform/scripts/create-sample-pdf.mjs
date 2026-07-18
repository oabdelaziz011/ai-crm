import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/test-fixtures");
mkdirSync(dir, { recursive: true });

const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([612, 792]);
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
page.drawText("VaultOS Knowledge PDF", { x: 72, y: 720, size: 18, font });
page.drawText("Enterprise policy handbook excerpt.", { x: 72, y: 690, size: 12, font });

const bytes = await pdfDoc.save();
writeFileSync(resolve(dir, "sample.pdf"), bytes);
console.log("sample.pdf written", bytes.length, "bytes");
