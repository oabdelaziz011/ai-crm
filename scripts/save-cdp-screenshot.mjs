import { readFileSync, writeFileSync } from "node:fs";

const [jsonPath, outPath] = process.argv.slice(2);
if (!jsonPath || !outPath) {
  console.error("Usage: node save-cdp-screenshot.mjs <cdp-json> <out.png>");
  process.exit(1);
}

const raw = readFileSync(jsonPath, "utf8");
const parsed = JSON.parse(raw);
const b64 = parsed.result?.data ?? parsed.data;
if (!b64) {
  console.error("No base64 data in", jsonPath);
  process.exit(1);
}

writeFileSync(outPath, Buffer.from(b64, "base64"));
console.log("saved", outPath, writeFileSync.length);
