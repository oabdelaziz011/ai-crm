import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync } from "node:fs";

const c = new pg.Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await c.connect();
await c.query(`select set_config('request.jwt.claim.role','service_role',false)`);
await c.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
await c.query("set session_replication_role = replica");
await c.query("set row_security = off");

const companies = JSON.parse(readFileSync("artifacts/.local-dev-clone/companies.json", "utf8"));
const localCols = await c.query(
  `select column_name, data_type, udt_name from information_schema.columns
   where table_schema='public' and table_name='companies' order by ordinal_position`,
);
const meta = new Map(localCols.rows.map((r) => [r.column_name, r]));

function coerce(col, v) {
  if (v === null || v === undefined) return null;
  const m = meta.get(col);
  const dt = m?.data_type || "";
  const udt = m?.udt_name || "";
  if (dt === "jsonb" || dt === "json" || udt === "jsonb" || udt === "json") {
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString();
    return null;
  }
  if ((dt.startsWith("timestamp") || dt === "date") && (v === "" || v === "{}")) return null;
  return v;
}

for (const row of companies) {
  const cols = Object.keys(row).filter((k) => meta.has(k));
  const values = cols.map((col) => coerce(col, row[col]));
  // find bad timestamp values
  for (let i = 0; i < cols.length; i++) {
    const m = meta.get(cols[i]);
    if (m.data_type.startsWith("timestamp") || m.data_type === "date") {
      console.log(row.name, cols[i], JSON.stringify(values[i]));
    }
  }
  const ph = cols.map((_, i) => `$${i + 1}`).join(",");
  try {
    await c.query("begin");
    await c.query(
      `insert into public.companies (${cols.map((x) => `"${x}"`).join(",")}) values (${ph})
       on conflict (id) do update set name = excluded.name`,
      values,
    );
    await c.query("commit");
    console.log("OK", row.name);
  } catch (e) {
    await c.query("rollback");
    console.error("FAIL", row.name, e.message);
    // binary search which col
    for (let i = 0; i < cols.length; i++) {
      const one = values[i];
      const dt = meta.get(cols[i]).data_type;
      if (dt.startsWith("timestamp") || dt === "uuid" || dt === "boolean" || dt.startsWith("numeric") || dt === "integer") {
        try {
          await c.query(`select $1::${dt === "uuid" ? "uuid" : dt.startsWith("timestamp") ? "timestamptz" : dt === "boolean" ? "boolean" : "text"}`, [one]);
        } catch (e2) {
          console.error("  bad col", cols[i], dt, JSON.stringify(one), e2.message);
        }
      }
    }
  }
}

const check = await c.query(`select id, name from companies where id = any($1::uuid[])`, [
  companies.map((x) => x.id),
]);
console.log("present", check.rows);
await c.end();
