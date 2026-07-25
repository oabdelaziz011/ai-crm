import { readFileSync, writeFileSync } from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node save-screenshot-b64.mjs <json-or-raw-b64-file> <out.png>");
  process.exit(1);
}

const raw = readFileSync(inputPath, "utf8").trim();
let b64 = raw;
try {
  const parsed = JSON.parse(raw);
  b64 = parsed.data ?? parsed.result?.data ?? raw;
} catch {
  // raw base64 string
}

writeFileSync(outputPath, Buffer.from(b64, "base64"));
console.log("saved", outputPath, Buffer.from(b64, "base64").length, "bytes");
