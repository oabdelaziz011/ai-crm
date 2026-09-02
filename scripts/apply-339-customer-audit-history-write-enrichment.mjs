/**
 * Apply ONLY migration 339 (customer audit write enrichment).
 * Live 334–338 are reserved for unrelated migrations — do not touch them.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "339_customer_audit_history_write_enrichment.sql";
const version = "339";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const report = {
  ok: false,
  migration: migrationName,
  sqlSha256: createHash("sha256").update(sql).digest("hex"),
  registered: false,
  skipped: false,
  verdict: "GAP FOUND",
};

try {
  if (
    /\b(update|delete|insert\s+into)\s+public\.(customers|marketing_campaigns|marketing_campaign_recipients|notification_queue)\b/i.test(
      sql,
    )
  ) {
    throw new Error("STOP: migration 339 appears to contain business DML");
  }
  if (!/phone_e164/.test(sql)) {
    throw new Error("STOP: migration 339 missing phone_e164 enrichment");
  }

  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rowCount > 0) {
    const name = String(existing.rows[0]?.name ?? "");
    if (!name.includes("customer_audit_history_write_enrichment")) {
      throw new Error(
        `STOP: version 339 already registered as different migration: ${name}`,
      );
    }
    report.skipped = true;
    report.ok = true;
    report.existing = existing.rows[0];
    report.verdict = "ALREADY APPLIED";
    writeFileSync(
      resolve(root, "scripts/_tmp-339-apply-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const before = {
    customers: (
      await client.query(`select count(*)::int as n from public.customers`)
    ).rows[0].n,
    audit_logs: (
      await client.query(`select count(*)::int as n from public.audit_logs`)
    ).rows[0].n,
    marketing_campaign_recipients: (
      await client.query(
        `select count(*)::int as n from public.marketing_campaign_recipients`,
      )
    ).rows[0].n,
    notification_queue: (
      await client.query(`select count(*)::int as n from public.notification_queue`)
    ).rows[0].n,
  };

  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
    [version, "customer_audit_history_write_enrichment"],
  );
  await client.query("commit");
  report.registered = true;

  const after = {
    customers: (
      await client.query(`select count(*)::int as n from public.customers`)
    ).rows[0].n,
    audit_logs: (
      await client.query(`select count(*)::int as n from public.audit_logs`)
    ).rows[0].n,
    marketing_campaign_recipients: (
      await client.query(
        `select count(*)::int as n from public.marketing_campaign_recipients`,
      )
    ).rows[0].n,
    notification_queue: (
      await client.query(`select count(*)::int as n from public.notification_queue`)
    ).rows[0].n,
  };
  for (const key of Object.keys(before)) {
    if (after[key] !== before[key]) {
      throw new Error(`STOP: count drift on ${key}`);
    }
  }

  const def = (
    await client.query(
      `select pg_get_functiondef('public.write_audit_log()'::regprocedure) as def`,
    )
  ).rows[0].def;
  if (!/phone_e164/.test(def)) {
    throw new Error("STOP: write_audit_log missing phone_e164 after apply");
  }
  if (!/TG_TABLE_NAME in \('customers', 'bookings', 'invoices'\)/.test(def)) {
    throw new Error("STOP: write_audit_log missing company_id enrichment");
  }

  report.ok = true;
  report.verdict = "SAFE — 339 APPLIED";
  report.before = before;
  report.after = after;
  writeFileSync(
    resolve(root, "scripts/_tmp-339-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  report.ok = false;
  report.verdict = "GAP FOUND";
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(root, "scripts/_tmp-339-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await client.end();
}
