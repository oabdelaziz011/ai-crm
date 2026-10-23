/**
 * Focused core import: auth + companies + profiles + roles + CRM business tables.
 * Faster path before full bulk import of audit/telemetry.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.VALUEOR_ENV = "local";

// Reuse main importer but we call import via dynamic import of functions —
// simpler: run a filtered mode by setting env.
process.env.LOCAL_CLONE_CORE_ONLY = "1";

const r = spawnSync(process.execPath, [resolve(root, "scripts/_local-clone-dev-tenants.mjs"), "import"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
