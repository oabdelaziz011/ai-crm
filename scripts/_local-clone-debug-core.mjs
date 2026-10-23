import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync } from "node:fs";

const c = new pg.Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await c.connect();
await c.query(`select set_config('request.jwt.claim.role','service_role',false)`);
await c.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);

const companies = JSON.parse(readFileSync("artifacts/.local-dev-clone/companies.json", "utf8"));
console.log(
  "companies export",
  companies.map((x) => ({ id: x.id, name: x.name, keys: Object.keys(x).length })),
);

const localCols = await c.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='companies'`,
);
console.log("local company cols", localCols.rows.length);

const existing = await c.query(
  `select id, name from companies where id = any($1::uuid[])`,
  [companies.map((x) => x.id)],
);
console.log("already present", existing.rows);

const row = companies[0];
const cols = Object.keys(row).filter((k) => localCols.rows.some((r) => r.column_name === k));
try {
  await c.query("begin");
  await c.query("set local session_replication_role = replica");
  const values = cols.map((col) => {
    let v = row[col];
    if (v !== null && typeof v === "object") v = JSON.stringify(v);
    return v;
  });
  const ph = cols.map((_, i) => `$${i + 1}`).join(",");
  await c.query(
    `insert into public.companies (${cols.map((c) => `"${c}"`).join(",")}) values (${ph})
     on conflict (id) do update set name = excluded.name`,
    values,
  );
  await c.query("commit");
  console.log("inserted/updated company", row.id, row.name);
} catch (e) {
  await c.query("rollback");
  console.error("company insert error:", e.message);
}

const profiles = JSON.parse(readFileSync("artifacts/.local-dev-clone/profiles.json", "utf8"));
console.log("profiles export", profiles.length);
const auth = await c.query(
  `select id, email, (encrypted_password is not null) as has_hash from auth.users
   where email in ('oabdelaziz011@gmail.com','nhossam@ntgclarity.com')`,
);
console.log("auth local", auth.rows);

await c.end();
