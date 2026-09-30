/**
 * LOCAL ONLY — audit (and optionally repair tracking for) Web Presence migrations 397–401.
 * Does not re-execute SQL. Does not touch production.
 *
 *   node scripts/reconcile-local-schema-migrations-397-401.mjs
 *   node scripts/reconcile-local-schema-migrations-397-401.mjs --repair-local
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve("D:/ValueOR/project");
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const dbUrl = env.DATABASE_URL?.trim() ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):54322\b/.test(dbUrl)) {
  throw new Error("Refusing: DATABASE_URL is not local 127.0.0.1:54322");
}

const repair = process.argv.includes("--repair-local");
const files = readdirSync(resolve(root, "supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort();
const fileByVersion = new Map();
for (const file of files) {
  const version = file.match(/^(\d+)/)?.[1];
  if (version) fileByVersion.set(version, file);
}

const TARGETS = [
  {
    version: "393",
    file: fileByVersion.get("393") ?? null,
    expected: "no committed file (numbering gap after 392)",
    probe: async () => ({ applied: false, note: "no repo file; no expected objects" }),
  },
  {
    version: "394",
    file: fileByVersion.get("394") ?? null,
    expected: "no committed file (numbering gap after 392)",
    probe: async () => ({ applied: false, note: "no repo file; no expected objects" }),
  },
  {
    version: "395",
    file: fileByVersion.get("395") ?? null,
    expected: "no committed file (numbering gap after 392)",
    probe: async () => ({ applied: false, note: "no repo file; no expected objects" }),
  },
  {
    version: "396",
    file: fileByVersion.get("396") ?? null,
    expected: "no committed file (numbering gap after 392)",
    probe: async () => ({ applied: false, note: "no repo file; no expected objects" }),
  },
  {
    version: "397",
    file: "397_portal_public_rpc_hardening.sql",
    expected: "internal.company_publicly_unlocked + portal public RPC hardening",
    probe: async (c) => {
      const r = await c.query(
        `select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='internal' and p.proname='company_publicly_unlocked') as ok`,
      );
      return { applied: r.rows[0].ok, note: "function internal.company_publicly_unlocked" };
    },
  },
  {
    version: "398",
    file: "398_web_presence_entitlements.sql",
    expected: "feature_definitions web_presence_page + web_chat_widget",
    probe: async (c) => {
      const r = await c.query(
        `select count(*)::int as n from public.feature_definitions where code in ('web_presence_page','web_chat_widget')`,
      );
      return { applied: r.rows[0].n === 2, note: `feature rows=${r.rows[0].n}` };
    },
  },
  {
    version: "399",
    file: "399_web_presence_data_foundation.sql",
    expected: "web_presence_pages, web_chat_widgets, web_chat_visitor_sessions",
    probe: async (c) => {
      const r = await c.query(`
        select
          exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_chat_widgets') as widgets,
          exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_presence_pages') as pages,
          exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_chat_visitor_sessions') as sessions
      `);
      const ok = r.rows[0].widgets && r.rows[0].pages && r.rows[0].sessions;
      return { applied: ok, note: JSON.stringify(r.rows[0]) };
    },
  },
  {
    version: "400",
    file: "400_web_chat_public_backend.sql",
    expected: "web_chat_message_submissions + web_chat_public_* RPCs",
    probe: async (c) => {
      const r = await c.query(`
        select
          exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_chat_message_submissions') as ledger,
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='web_chat_public_create_session') as rpc
      `);
      return { applied: r.rows[0].ledger && r.rows[0].rpc, note: JSON.stringify(r.rows[0]) };
    },
  },
  {
    version: "401",
    file: "401_web_chat_public_staff_reply_guard.sql",
    expected: "internal.enforce_public_web_chat_staff_reply + trigger",
    probe: async (c) => {
      const r = await c.query(`
        select
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='internal' and p.proname='enforce_public_web_chat_staff_reply') as fn,
          exists(select 1 from pg_trigger where tgname='conversation_messages_public_web_chat_staff_reply') as trg
      `);
      return { applied: r.rows[0].fn && r.rows[0].trg, note: JSON.stringify(r.rows[0]) };
    },
  },
];

const c = new pg.Client({ connectionString: dbUrl });
await c.connect();
try {
  const tracked = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = any($1::text[])`,
    [TARGETS.map((t) => t.version)],
  );
  const trackedMap = new Map(tracked.rows.map((r) => [String(r.version), r.name]));
  const rows = [];
  for (const target of TARGETS) {
    const fileExists = target.file ? existsSync(resolve(root, "supabase/migrations", target.file)) : false;
    const probe = await target.probe(c);
    const isTracked = trackedMap.has(target.version);
    const safe =
      fileExists &&
      probe.applied &&
      !isTracked &&
      ["397", "398", "399", "400", "401"].includes(target.version);
    rows.push({
      migration: target.version,
      file: target.file,
      fileExists,
      expectedSchemaEffect: target.expected,
      localApplied: probe.applied,
      localTracked: isTracked,
      trackedName: trackedMap.get(target.version) ?? null,
      probe: probe.note,
      safeToReconcile: safe,
      productionStatus: "unknown (not queried)",
    });
  }

  console.log(JSON.stringify({ database: "local", repairRequested: repair, rows }, null, 2));

  if (repair) {
    for (const row of rows) {
      if (!row.safeToReconcile) continue;
      await c.query(
        `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
        [row.migration, row.file],
      );
      console.log(`REPAIRED_LOCAL ${row.migration} ${row.file}`);
    }
  }
} finally {
  await c.end();
}
