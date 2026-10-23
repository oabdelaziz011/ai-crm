import pg from "../lib/db/node_modules/pg/lib/index.js";

const c = new pg.Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await c.connect();
const { rows } = await c.query(
  `select column_name, data_type, is_nullable
   from information_schema.columns
   where table_schema='auth' and table_name='identities'
   order by ordinal_position`,
);
console.log("identities", rows);
const u = await c.query(
  `select column_name from information_schema.columns
   where table_schema='auth' and table_name='users'
   order by ordinal_position`,
);
console.log("users", u.rows.map((r) => r.column_name));
const demo = await c.query(`select id, email from auth.users limit 3`);
console.log("sample users", demo.rows);
await c.end();
