/**
 * LOCAL ONLY — build the human approval manifest from the latest read-only capture.
 * Does not mutate the database.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApprovalManifest } from "./plan-opportunity-identity-repair.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const capturePath = resolve(here, "approval-manifest.json");
const outPath = resolve(here, "APPROVAL-MANIFEST.ready.json");

const capture = JSON.parse(readFileSync(capturePath, "utf8"));
const manifest = buildApprovalManifest(capture);
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({
  status: manifest.status,
  capturedAt: manifest.capturedAt,
  summary: manifest.summary,
  classification_counts: manifest.classification_counts,
  wrote: outPath,
  historical_rows_modified: manifest.safety.historical_rows_modified,
  repair_sql_executed: manifest.safety.repair_sql_executed,
}, null, 2));
