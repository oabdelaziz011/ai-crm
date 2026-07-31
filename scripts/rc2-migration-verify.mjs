/**
 * RC-2: Verify migrations 167-170 via direct Postgres when DATABASE_URL is set.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const f of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const TARGET = ["167", "168", "169", "170"];
const report = { checkedAt: new Date().toISOString(), databaseUrlPresent: Boolean(env.DATABASE_URL), migrations: {} };

if (!env.DATABASE_URL) {
  report.status = "blocked";
  report.detail = "DATABASE_URL not configured locally";
  console.log(JSON.stringify(report, null, 2));
  writeFileSync(resolve(root, "docs/architecture/rc2-migration-verify.json"), JSON.stringify(report, null, 2));
  process.exit(0);
}

const pg = await import("pg");
const client = new pg.default.Client({ connectionString: env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `select version from supabase_migrations.schema_migrations order by version`,
);
const applied = new Set(rows.map((r) => String(r.version)));

for (const id of TARGET) {
  const matches = [...applied].filter((v) => v.startsWith(id));
  report.migrations[id] = {
    status: matches.length > 0 ? "applied" : "not_applied",
    versions: matches,
  };
}

await client.end();
report.status = Object.values(report.migrations).every((m) => m.status === "applied") ? "all_applied" : "partial";
writeFileSync(resolve(root, "docs/architecture/rc2-migration-verify.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
