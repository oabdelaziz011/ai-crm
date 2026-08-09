import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const payload = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-export.json"), "utf8"),
);
// Supabase v2 persistSession format
const stored = JSON.stringify(payload.session);
console.log(JSON.stringify({ key: payload.storageKey, value: stored }));
