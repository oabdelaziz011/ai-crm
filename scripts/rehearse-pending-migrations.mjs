#!/usr/bin/env node
/**
 * Prints the local-only rehearsal steps. Refuses to run if a Production target
 * or `supabase --linked` is requested. Does not connect and does not apply SQL.
 */
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const joined = process.argv.slice(2).join(" ");
if (/--linked\b/.test(joined)) {
  console.error("Refusing --linked. Rehearsal must not touch the hosted Production project.");
  process.exit(2);
}
for (const arg of process.argv.slice(2)) {
  if (isProductionDatabaseUrl(arg)) {
    console.error("Refusing a Production database URL.");
    process.exit(2);
  }
}

console.log(`Local rehearsal only. Do not use --linked and do not apply this to Production.

1. Confirm a restorable Production backup id. This script does not create one.
2. Restore that backup into a disposable database, or use the isolated local stack at 127.0.0.1:54322.
3. Apply pending files in order: 361, then 373 through 441.
4. Use the Supabase CLI against that disposable target. Do not insert rows into schema_migrations by hand.
5. Run: node scripts/verify-least-privilege.mjs
`);
