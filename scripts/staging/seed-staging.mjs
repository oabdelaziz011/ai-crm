#!/usr/bin/env node
/**
 * Refuses to seed until .env.staging passes isolation checks.
 * This file does not connect to a database and does not insert rows.
 */
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertStagingEnvironmentSafety } from "../lib/env-mode.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stagingFile = resolve(root, ".env.staging");

if (!existsSync(stagingFile)) {
  console.error("STAGING SEED NOT APPLIED. .env.staging is missing, so no database was contacted.");
  process.exit(2);
}

const env = { VALUEOR_ENV: "staging" };
for (const line of (await import("node:fs")).readFileSync(stagingFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

try {
  assertStagingEnvironmentSafety(env);
} catch (error) {
  const message = error instanceof Error ? error.message : "Staging configuration was rejected.";
  console.error(message);
  console.error("STAGING SEED NOT APPLIED. No database was contacted.");
  process.exit(2);
}

console.error("STAGING SEED NOT APPLIED. The staging project must exist, be empty, and be approved before rows are inserted.");
process.exit(2);
