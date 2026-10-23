import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync, existsSync } from "node:fs";

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
  "company_channels",
  "company_feature_overrides",
];

for (const table of tables) {
  const path = `artifacts/.local-dev-clone/table-${table}.json`;
  if (!existsSync(path)) {
    console.log(table, "no export");
    continue;
  }
  const rows = JSON.parse(readFileSync(path, "utf8"));
  const local = await c.query(
    `select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name=$1`,
    [table],
  );
  if (!local.rows.length) {
    console.log(table, "missing locally");
    continue;
  }
  const meta = new Map(local.rows.map((r) => [r.column_name, r]));
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const use = Object.keys(row).filter((k) => meta.has(k));
    const vals = use.map((k) => {
      let v = row[k];
      const dt = meta.get(k).data_type;
      const udt = meta.get(k).udt_name;
      if (v === null || v === undefined) return null;
      if (dt === "jsonb" || dt === "json" || udt === "jsonb") {
        return typeof v === "string" ? v : JSON.stringify(v);
      }
      if (typeof v === "object") {
        if (Object.keys(v).length === 0 && dt.startsWith("timestamp")) return new Date().toISOString();
        return null;
      }
      // scrub secrets
      if (/token|secret|password|credential|api_key/i.test(k) && !/status|hint|expires|checked|alert/i.test(k)) {
        return null;
      }
      return v;
    });
    const ph = use.map((_, i) => `$${i + 1}`).join(",");
    try {
      await c.query("begin");
      await c.query(
        `insert into public."${table}" (${use.map((x) => `"${x}"`).join(",")}) values (${ph}) on conflict do nothing`,
        vals,
      );
      await c.query("commit");
      ok++;
    } catch (e) {
      await c.query("rollback");
      fail++;
      if (fail <= 2) console.log(table, "fail", e.message);
    }
  }
  const count = await c.query(`select count(*)::int n from public."${table}"`);
  console.log({ table, exported: rows.length, ok, fail, localCount: count.rows[0].n });
}

await c.end();
