import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const secret = "ephemeral-rls-test-secret-value-32b";
const apiBase = "http://127.0.0.1:55433";
const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EXEC = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SCHED = "12121212-1212-4121-8121-121212121212";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOOL = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function ignore(command, args) {
  spawnSync(command, args, { encoding: "utf8" });
}

function sleep(ms) {
  spawnSync("powershell", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`], { encoding: "utf8" });
}

function jwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function token(role, userId, companyId, permissions) {
  return jwt({
    role,
    sub: userId,
    company_id: companyId,
    app_permissions: permissions,
  });
}

async function api(auth, resource, options = {}) {
  const response = await fetch(`${apiBase}${resource}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: auth,
      authorization: `Bearer ${auth}`,
      "content-type": "application/json",
      ...(options.prefer ? { prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, text, range: response.headers.get("content-range") };
}

async function serviceRow(auth, table, id) {
  const response = await api(auth, `/${table}?id=eq.${id}&select=*`);
  assert(response.status === 200 && Array.isArray(response.body), `service read failed ${response.text}`);
  return response.body[0] ?? null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const view = token("authenticated", USER_A, COMPANY_A, ["products.view"]);
  const create = token("authenticated", USER_A, COMPANY_A, ["products.create"]);
  const edit = token("authenticated", USER_A, COMPANY_A, ["products.edit"]);
  const pricing = token("authenticated", USER_A, COMPANY_A, ["products.pricing"]);
  const editPricing = token("authenticated", USER_A, COMPANY_A, ["products.edit", "products.pricing"]);
  const remove = token("authenticated", USER_A, COMPANY_A, ["products.delete"]);
  const website = token("authenticated", USER_A, COMPANY_A, ["web_presence.manage"]);
  const owner = token("authenticated", USER_A, COMPANY_A, ["tools.execute"]);
  const other = token("authenticated", USER_B, COMPANY_A, ["tools.execute", "products.view"]);
  const otherCompany = token("authenticated", USER_A, COMPANY_B, ["tools.execute", "products.view"]);
  const service = token("service_role", USER_B, COMPANY_B, []);

  const listed = await api(view, `/catalog_products?id=eq.${PRODUCT}&select=id,name,base_price`);
  assert(listed.status === 200 && listed.body[0]?.name === "Headphones", `view read failed ${listed.status} ${listed.text}`);

  const viewWrite = await api(view, "/catalog_products", {
    method: "POST",
    body: { company_id: COMPANY_A, name: "Blocked", sku: "BLOCK-1" },
  });
  assert(viewWrite.status >= 400, `view insert was allowed ${viewWrite.status} ${viewWrite.text}`);
  const viewRename = await api(view, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { name: "View rename" },
  });
  assert(viewRename.status < 500, `view rename errored ${viewRename.text}`);
  assert((await serviceRow(service, "catalog_products", PRODUCT))?.name === "Headphones", "view permission renamed the product");

  const created = await api(create, "/catalog_products", {
    method: "POST",
    body: { company_id: COMPANY_A, name: "Created", sku: "NEW-1", base_price: 10 },
  });
  assert(created.status === 201, `create insert failed ${created.status} ${created.text}`);
  const createdRows = await api(service, "/catalog_products?sku=eq.NEW-1&select=id,name,base_price");
  assert(createdRows.body?.[0]?.name === "Created", `created row missing ${createdRows.text}`);
  const createdId = createdRows.body[0].id;
  const createEdit = await api(create, `/catalog_products?id=eq.${createdId}`, {
    method: "PATCH",
    body: { name: "Renamed by creator" },
  });
  assert(createEdit.status < 500, `create rename errored ${createEdit.text}`);
  assert((await serviceRow(service, "catalog_products", createdId))?.name === "Created", "create permission updated an existing row");

  const renamed = await api(edit, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { name: "Renamed" },
  });
  assert(renamed.status < 400, `edit rename failed ${renamed.status} ${renamed.text}`);
  assert((await serviceRow(service, "catalog_products", PRODUCT))?.name === "Renamed", "edit did not rename");
  const baseBlocked = await api(edit, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { base_price: 1 },
  });
  assert(String(baseBlocked.text).includes("products.pricing"), `pricing trigger did not reject base_price ${baseBlocked.text}`);
  const costBlocked = await api(edit, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { cost: 1 },
  });
  assert(String(costBlocked.text).includes("products.pricing"), `pricing trigger did not reject cost ${costBlocked.text}`);
  assert(Number((await serviceRow(service, "catalog_products", PRODUCT))?.base_price) === 249.5, "rejected price change was stored");

  const pricingRow = await api(pricing, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { name: "Pricing rename", base_price: 5 },
  });
  assert(pricingRow.status < 500, `pricing rename errored ${pricingRow.text}`);
  const afterPricing = await serviceRow(service, "catalog_products", PRODUCT);
  assert(afterPricing?.name === "Renamed" && Number(afterPricing.base_price) === 249.5, `pricing alone updated the product ${JSON.stringify(afterPricing)}`);
  const regionalBlocked = await api(edit, "/product_regional_prices", {
    method: "POST",
    body: { company_id: COMPANY_A, product_id: PRODUCT, local_price: 80 },
  });
  assert(regionalBlocked.status >= 400, `edit inserted a regional price ${regionalBlocked.text}`);
  const regional = await api(pricing, "/product_regional_prices", {
    method: "POST",
    body: { company_id: COMPANY_A, product_id: PRODUCT, local_price: 80 },
  });
  assert(regional.status === 201, `pricing regional insert failed ${regional.status} ${regional.text}`);
  const regionalRows = await api(service, `/product_regional_prices?product_id=eq.${PRODUCT}&select=local_price`);
  assert(Number(regionalRows.body?.[0]?.local_price) === 80, `regional price missing ${regionalRows.text}`);
  const priced = await api(editPricing, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { base_price: 19, cost: 4 },
  });
  assert(priced.status < 400, `edit+pricing price update failed ${priced.status} ${priced.text}`);
  const afterPrice = await serviceRow(service, "catalog_products", PRODUCT);
  assert(Number(afterPrice?.base_price) === 19 && Number(afterPrice?.cost) === 4, `price columns were not updated ${JSON.stringify(afterPrice)}`);

  const deleteRename = await api(remove, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { name: "Deleted name" },
  });
  assert(String(deleteRename.text).includes("products.edit"), `delete permission changed the name ${deleteRename.text}`);
  const archived = await api(remove, `/catalog_products?id=eq.${PRODUCT}`, {
    method: "PATCH",
    body: { deleted_at: new Date().toISOString(), is_active: false },
  });
  assert(archived.status < 400, `archive failed ${archived.status} ${archived.text}`);
  const afterArchive = await serviceRow(service, "catalog_products", PRODUCT);
  assert(afterArchive?.deleted_at && afterArchive.is_active === false && afterArchive.name === "Renamed", `archive row mismatch ${JSON.stringify(afterArchive)}`);

  const siteRead = await api(website, `/catalog_products?id=eq.${PRODUCT}&select=id,name`);
  assert(siteRead.status === 200 && siteRead.body.length === 1, `website read failed ${siteRead.text}`);
  const siteWrite = await api(website, "/catalog_products", {
    method: "POST",
    body: { company_id: COMPANY_A, name: "Site", sku: "SITE-1" },
  });
  assert(siteWrite.status >= 400, `website manage inserted a product ${siteWrite.text}`);

  const foreign = await api(otherCompany, `/catalog_products?id=eq.${PRODUCT}&select=id`);
  assert(Array.isArray(foreign.body) && foreign.body.length === 0, `other company read catalog ${foreign.text}`);

  const hiddenPayload = await api(owner, `/tool_executions?id=eq.${EXEC}&select=input,output`);
  assert(hiddenPayload.status >= 400, `owner selected input/output ${hiddenPayload.status} ${hiddenPayload.text}`);
  const visible = await api(owner, `/tool_executions?id=eq.${EXEC}&select=id,status,tool_key,duration_ms`);
  assert(visible.status === 200 && visible.body[0]?.tool_key === "search_products", `status read failed ${visible.text}`);
  assert(!("input" in visible.body[0]) && !("output" in visible.body[0]), "status response included payload columns");

  const running = await api(owner, `/tool_executions?id=eq.${EXEC}&select=id,status,tool_key`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { status: "running" },
  });
  assert(running.status === 200 && running.body[0]?.status === "running", `owner markRunning failed ${running.status} ${running.text}`);
  const completed = await api(owner, `/tool_executions?id=eq.${EXEC}&select=id,status,duration_ms`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { status: "succeeded", output: { marker: "owner-complete" }, duration_ms: 9 },
  });
  assert(completed.status === 200 && completed.body[0]?.status === "succeeded", `owner complete failed ${completed.status} ${completed.text}`);

  const ownRpc = await api(owner, "/rpc/read_own_tool_execution", {
    method: "POST",
    body: { p_execution_id: EXEC },
  });
  assert(ownRpc.body?.output?.marker === "owner-complete", `owner rpc missed output ${ownRpc.text}`);
  const otherRpc = await api(other, "/rpc/read_own_tool_execution", {
    method: "POST",
    body: { p_execution_id: EXEC },
  });
  assert(otherRpc.body === null, `other user read the payload ${otherRpc.text}`);
  const companyRpc = await api(otherCompany, "/rpc/read_own_tool_execution", {
    method: "POST",
    body: { p_execution_id: EXEC },
  });
  assert(companyRpc.body === null, `other company read the payload ${companyRpc.text}`);

  const stolen = await api(other, `/tool_executions?id=eq.${EXEC}&select=id,status`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { status: "failed", output: { stolen: true } },
  });
  assert(stolen.status >= 400 || (Array.isArray(stolen.body) && stolen.body.length === 0), `other user updated the execution ${stolen.status} ${stolen.text}`);
  const cross = await api(otherCompany, `/tool_executions?id=eq.${EXEC}&select=id,status`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { status: "failed" },
  });
  assert(cross.status >= 400 || (Array.isArray(cross.body) && cross.body.length === 0), `other company updated the execution ${cross.status} ${cross.text}`);

  const keyChange = await api(owner, `/tool_executions?id=eq.${EXEC}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { tool_key: "get_product_details" },
  });
  assert(keyChange.status >= 400, `tool_key update was allowed ${keyChange.text}`);
  const ownerChange = await api(owner, `/tool_executions?id=eq.${EXEC}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { created_by: USER_B, company_id: COMPANY_B, conversation_id: "abababab-abab-4bab-8bab-abababababab" },
  });
  assert(ownerChange.status >= 400, `identity update was allowed ${ownerChange.text}`);

  run("docker", ["exec", "rls-audit-pg", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
    "grant update (id, tool_key, company_id, conversation_id, created_by) on public.tool_executions to authenticated;"]);
  for (const [label, body] of [
    ["tool_key", { tool_key: "get_product_details" }],
    ["created_by", { created_by: USER_B }],
    ["company_id", { company_id: COMPANY_B }],
    ["conversation_id", { conversation_id: "abababab-abab-4bab-8bab-abababababab" }],
  ]) {
    const frozen = await api(owner, `/tool_executions?id=eq.${EXEC}&select=id,tool_key,company_id,conversation_id,created_by`, {
      method: "PATCH",
      prefer: "return=representation",
      body,
    });
    assert(String(frozen.text).includes("tool_execution_identity_frozen"), `${label} trigger did not freeze identity ${frozen.text}`);
  }
  run("docker", ["exec", "rls-audit-pg", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
    "revoke update (id, tool_key, company_id, conversation_id, created_by) on public.tool_executions from authenticated;"]);

  const unchanged = await api(service, `/tool_executions?id=eq.${EXEC}&select=status,output,created_by,company_id,tool_key`);
  assert(unchanged.body[0]?.status === "succeeded", `status changed ${unchanged.text}`);
  assert(unchanged.body[0]?.created_by === USER_A, `owner changed ${unchanged.text}`);
  assert(unchanged.body[0]?.company_id === COMPANY_A, `company changed ${unchanged.text}`);
  assert(unchanged.body[0]?.tool_key === "search_products", `tool key changed ${unchanged.text}`);
  assert(unchanged.body[0]?.output?.marker === "owner-complete", `output was overwritten ${unchanged.text}`);

  const serviceRead = await api(service, `/tool_executions?id=eq.${SCHED}&select=tool_key,status,input,output`);
  assert(serviceRead.status === 200 && serviceRead.body[0]?.output?.slot === "09:00", `service seed read failed ${serviceRead.text}`);
  const serviceWrite = await api(service, `/tool_executions?id=eq.${EXEC}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { status: "succeeded", output: { marker: "service-complete" } },
  });
  assert(serviceWrite.status === 200 && serviceWrite.body[0]?.output?.marker === "service-complete", `service update failed ${serviceWrite.text}`);

  const publication = run("docker", ["exec", "rls-audit-pg", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c",
    "select count(*) from pg_publication_tables where tablename = 'tool_executions';"]);
  assert(publication.trim() === "0", `ephemeral publication contained tool_executions: ${publication}`);

  run(process.execPath, ["--import", "tsx/esm", path.join(root, "supabase/tests/ephemeral-tool-router-cycle.ts")], {
      cwd: path.join(root, "lib/ai-tool-router"),
      env: {
        ...process.env,
        EPHEMERAL_API: apiBase,
        EPHEMERAL_USER_JWT: owner,
        EPHEMERAL_OTHER_JWT: other,
        EPHEMERAL_OTHER_COMPANY_JWT: otherCompany,
        EPHEMERAL_SERVICE_JWT: service,
    },
  });

  console.log("ephemeral PostgREST RLS checks passed");
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/`);
      if (response.status < 500) return;
    } catch {
      // container still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const status = spawnSync("docker", ["ps", "-a", "--filter", "name=rls-audit", "--format", "{{.Names}} {{.Status}} {{.Ports}}"], { encoding: "utf8" });
  const logs = spawnSync("docker", ["logs", "rls-audit-postgrest"], { encoding: "utf8" });
  throw new Error(`ephemeral PostgREST did not start\n${status.stdout}\n${status.stderr}\n${logs.stdout}\n${logs.stderr}`);
}

function setup() {
  ignore("docker", ["rm", "-f", "rls-audit-pg", "rls-audit-postgrest"]);
  ignore("docker", ["network", "rm", "rls-audit-net"]);
  run("docker", ["network", "create", "rls-audit-net"]);
  run("docker", ["run", "-d", "--name", "rls-audit-pg", "--network", "rls-audit-net", "-e", "POSTGRES_PASSWORD=postgres", "-p", "55432:5432", "postgres:17-alpine"]);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = spawnSync("docker", ["exec", "rls-audit-pg", "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (ready.status === 0) break;
    if (attempt === 39) throw new Error("ephemeral postgres did not start");
    sleep(500);
  }
  const mapped = run("docker", ["port", "rls-audit-pg", "5432"]);
  if (!mapped.includes("55432") || mapped.includes("54322") || mapped.includes("54321")) {
    throw new Error(`refusing to migrate unexpected postgres port mapping: ${mapped}`);
  }
  const files = [
    ["supabase/tests/ephemeral-rls-bootstrap.sql", "/tmp/bootstrap.sql"],
    ["supabase/migrations/416_catalog_products_permission_rls.sql", "/tmp/416.sql"],
    ["supabase/migrations/417_tool_execution_output_column_privileges.sql", "/tmp/417.sql"],
  ];
  for (const [relative, target] of files) {
    run("docker", ["cp", path.join(root, relative), `rls-audit-pg:${target}`]);
  }
  run("docker", ["exec", "rls-audit-pg", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/bootstrap.sql"]);
  run("docker", ["exec", "rls-audit-pg", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/416.sql"]);
  run("docker", ["exec", "rls-audit-pg", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/417.sql"]);
  console.log("ephemeral migrations applied on 127.0.0.1:55432");
  run("docker", ["exec", "rls-audit-pg", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `
    insert into public.catalog_products (id, company_id, name, sku, base_price, cost)
    values ('${PRODUCT}', '${COMPANY_A}', 'Headphones', 'WH-100', 249.50, 40);
    insert into public.tool_executions (id, company_id, conversation_id, tool_definition_id, tool_key, input, output, status, created_by)
    values
      ('${EXEC}', '${COMPANY_A}', '${CONV}', '${TOOL}', 'search_products', '{"query":"WH-100"}', '{"price":249.5}', 'pending', '${USER_A}'),
      ('${SCHED}', '${COMPANY_A}', '${CONV}', '${TOOL}', 'search_availability', '{"day":"today"}', '{"slot":"09:00"}', 'succeeded', '${USER_B}');
  `]);
  run("docker", ["run", "-d", "--name", "rls-audit-postgrest", "--network", "rls-audit-net", "-p", "55433:3000",
    "-e", "PGRST_DB_URI=postgres://authenticator:authenticator@rls-audit-pg:5432/postgres",
    "-e", `PGRST_JWT_SECRET=${secret}`,
    "-e", "PGRST_DB_ANON_ROLE=anon",
    "-e", "PGRST_DB_SCHEMAS=public",
    "-e", "PGRST_SERVER_PORT=3000",
    "public.ecr.aws/supabase/postgrest:v14.5"]);
}

function cleanup() {
  spawnSync("docker", ["rm", "-f", "rls-audit-pg", "rls-audit-postgrest"], { encoding: "utf8" });
  spawnSync("docker", ["network", "rm", "rls-audit-net"], { encoding: "utf8" });
}

setup();
try {
  await waitForApi();
  await main();
} finally {
  cleanup();
}
