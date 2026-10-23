process.env.VALUEOR_ENV = "local";
await import("../src/load-env.js");
const databaseUrl = process.env.DATABASE_URL ?? "";
const supabaseUrl = process.env.SUPABASE_URL ?? "";
if (process.env.VALUEOR_ENV !== "local" || !databaseUrl.includes("127.0.0.1:54322") || !supabaseUrl.includes("127.0.0.1:54321")) {
  throw new Error("refusing non-local environment");
}
const { createRequire } = await import("node:module");
const requireDb = createRequire("D:/ValueOR/project/lib/db/package.json");
const pg = requireDb("pg");
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
const tables = await client.query(`
  select c.relname, c.relreplident::text as replica
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('leads','lead_stages','entity_activities','opportunities','opportunity_history','opportunity_stages')
  order by 1
`);
const publication = await client.query(`
  select tablename from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in ('leads','lead_stages','entity_activities','opportunities','opportunity_history','opportunity_stages','lead_tags')
  order by 1
`);
const columns = await client.query(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('leads','entity_activities')
    and column_name in ('company_id','tenant_id','title','name')
  order by 1, 2
`);
console.log(JSON.stringify({ tables: tables.rows, publication: publication.rows, columns: columns.rows }, null, 2));
await client.end();
process.exit(0);
