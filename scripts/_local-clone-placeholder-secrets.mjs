import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync, existsSync } from "node:fs";

const PLACEHOLDER = "LOCAL_SANITIZED_DISABLED";

const c = new pg.Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await c.connect();
await c.query("set session_replication_role = replica");
await c.query("set row_security = off");

const tables = [
  "company_email_settings",
  "company_whatsapp_settings",
  "company_instagram_settings",
];

for (const table of tables) {
  const path = `artifacts/.local-dev-clone/table-${table}.json`;
  if (!existsSync(path)) continue;
  const rows = JSON.parse(readFileSync(path, "utf8"));
  const local = await c.query(
    `select column_name, data_type, udt_name, is_nullable
     from information_schema.columns where table_schema='public' and table_name=$1`,
    [table],
  );
  const meta = new Map(local.rows.map((r) => [r.column_name, r]));
  let ok = 0;
  for (const row of rows) {
    const use = Object.keys(row).filter((k) => meta.has(k));
    const vals = use.map((k) => {
      let v = row[k];
      const m = meta.get(k);
      const dt = m.data_type;
      const udt = m.udt_name;
      const secretCol = /token|secret|password|credential|api_key|access_token/i.test(k);
      if (secretCol && !/status|hint|expires|checked|alert|lookup_hash/i.test(k)) {
        if (m.is_nullable === "NO") return PLACEHOLDER;
        return null;
      }
      if (v === null || v === undefined) {
        if (m.is_nullable === "NO" && secretCol) return PLACEHOLDER;
        return null;
      }
      if (dt === "jsonb" || dt === "json" || udt === "jsonb") {
        return typeof v === "string" ? v : JSON.stringify(sanitizeJson(v));
      }
      if (typeof v === "object") {
        if (Object.keys(v).length === 0 && dt.startsWith("timestamp")) return new Date().toISOString();
        return null;
      }
      return v;
    });
    const ph = use.map((_, i) => `$${i + 1}`).join(",");
    try {
      await c.query("begin");
      await c.query(
        `insert into public."${table}" (${use.map((x) => `"${x}"`).join(",")})
         values (${ph}) on conflict do nothing`,
        vals,
      );
      await c.query("commit");
      ok++;
    } catch (e) {
      await c.query("rollback");
      console.log(table, e.message);
    }
  }
  const count = await c.query(`select count(*)::int n from public."${table}"`);
  console.log({ table, ok, localCount: count.rows[0].n });
}

function sanitizeJson(v) {
  if (!v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sanitizeJson);
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (/token|secret|password|credential|api_key/i.test(k)) out[k] = null;
    else out[k] = sanitizeJson(val);
  }
  return out;
}

await c.end();
