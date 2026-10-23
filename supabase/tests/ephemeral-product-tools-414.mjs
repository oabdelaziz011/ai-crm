import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const container = "product-tools-414-pg";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function sleep(ms) {
  spawnSync("powershell", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`], { encoding: "utf8" });
}

function cleanup() {
  spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" });
}

function psql(sql) {
  return run("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql]);
}

cleanup();
try {
  run("docker", ["run", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=postgres", "-p", "55432:5432", "postgres:17-alpine"]);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (ready.status === 0) break;
    if (attempt === 39) throw new Error("ephemeral postgres did not start");
    sleep(500);
  }
  const mapped = run("docker", ["port", container, "5432"]);
  if (!mapped.includes("55432") || mapped.includes("54322") || mapped.includes("54321")) {
    throw new Error(`refusing to migrate unexpected postgres port mapping: ${mapped}`);
  }

  psql(`
    create table public.tool_definitions (
      id uuid primary key default gen_random_uuid(),
      key text not null unique,
      display_name text not null,
      description text not null default '',
      category text not null default 'general',
      version text not null default '1.0.0',
      is_enabled boolean not null default true,
      required_permissions jsonb not null default '[]'::jsonb,
      supported_states jsonb not null default '[]'::jsonb,
      input_schema jsonb not null default '{}'::jsonb,
      output_schema jsonb not null default '{}'::jsonb,
      timeout_ms integer not null default 30000 check (timeout_ms > 0),
      retry_policy jsonb not null default '{"maxAttempts": 1, "backoffMs": 0}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    insert into public.tool_definitions (key, display_name, category)
    values ('search_customer', 'Search Customers', 'customers');
  `);
  run("docker", ["cp", path.join(root, "supabase/migrations/414_ai_employee_product_lookup_tools.sql"), `${container}:/tmp/414.sql`]);
  run("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/414.sql"]);
  run("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/414.sql"]);

  const rows = psql("select key || '|' || category || '|' || is_enabled::text || '|' || required_permissions::text || '|' || timeout_ms::text from public.tool_definitions order by key;");
  const lines = rows.trim().split(/\r?\n/);
  if (lines.length !== 3) throw new Error(`expected 3 tool rows, got ${rows}`);
  const byKey = Object.fromEntries(lines.map((line) => [line.split("|")[0], line]));
  for (const key of ["search_products", "get_product_details"]) {
    const row = byKey[key];
    if (!row) throw new Error(`missing ${key}\n${rows}`);
    if (!row.startsWith(`${key}|products|true|`)) throw new Error(`product tool was not registered in the products category: ${row}`);
    if (!row.includes("products.view") || !row.includes("tools.execute")) throw new Error(`permissions missing on ${row}`);
  }
  if (byKey.search_customer !== "search_customer|customers|true|[]|30000") {
    throw new Error(`unrelated tool changed: ${byKey.search_customer}`);
  }
  const tables = psql("select count(*) from information_schema.tables where table_schema = 'public' and table_name <> 'tool_definitions';");
  if (tables.trim() !== "0") throw new Error(`migration created extra tables: ${tables}`);
  console.log("migration 414 registered both product tools in category products and left other tools unchanged");
} finally {
  cleanup();
}
