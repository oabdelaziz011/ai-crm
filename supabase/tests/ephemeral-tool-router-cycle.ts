import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "lib/ai-tool-router/package.json"));
const { createClient } = require("@supabase/supabase-js");

function clientFor(jwt: string): SupabaseClient {
  return createClient(process.env.EPHEMERAL_API ?? "", jwt, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
      fetch(input, init) {
        const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return fetch(raw.replace("/rest/v1", ""), init);
      },
    },
  });
}

async function main() {
const { ToolRouterService } = await import("../../lib/ai-tool-router/src/services/tool-router-service.ts");
const { createSupabaseToolExecutionRepository } = await import("../../lib/ai-tool-router/src/repositories/supabase-tool-repositories.ts");
const { createToolHandlerRegistry } = await import("../../lib/ai-tool-router/src/tools/tool-contract.ts");

const api = process.env.EPHEMERAL_API ?? "";
const userJwt = process.env.EPHEMERAL_USER_JWT ?? "";
const otherJwt = process.env.EPHEMERAL_OTHER_JWT ?? "";
const otherCompanyJwt = process.env.EPHEMERAL_OTHER_COMPANY_JWT ?? "";
const serviceJwt = process.env.EPHEMERAL_SERVICE_JWT ?? "";
const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOOL = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SCHED = "12121212-1212-4121-8121-121212121212";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const definition = {
  id: TOOL,
  key: "echo_probe",
  display_name: "Echo",
  description: "Ephemeral cycle probe",
  category: "test",
  version: "1",
  is_enabled: true,
  required_permissions: [] as string[],
  supported_states: [] as [],
  input_schema: {},
  output_schema: {},
  timeout_ms: 5000,
  retry_policy: { maxAttempts: 1, backoffMs: 0 },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function router(jwt: string) {
  return new ToolRouterService(
    { async findByKey(key: string) { return key === definition.key ? definition : null; } } as never,
    createSupabaseToolExecutionRepository(clientFor(jwt)),
    { async findById(id: string) {
      return id === CONV ? { id: CONV, company_id: COMPANY_A, state: "idle", customer_id: null, metadata: null } : null;
    } },
    createToolHandlerRegistry({
      echo_probe: {
        validate() {},
        supports() { return true; },
        async execute() { return { marker: "router-cycle" }; },
      },
    }),
  );
}

const userResult = await router(userJwt).route(
  {
    userId: USER_A,
    companyId: COMPANY_A,
    isSuperAdmin: false,
    hasPermission: (permission: string) => permission === "tools.execute",
  },
  { conversationId: CONV, toolKey: "echo_probe", input: { query: "WH-100" } },
);
assert(userResult.status === "succeeded", `user cycle status ${userResult.status} ${userResult.errorMessage}`);
assert(userResult.output?.marker === "router-cycle", "user cycle dropped its output");

const ownerRow = await createSupabaseToolExecutionRepository(clientFor(userJwt)).findById(userResult.executionId);
assert(ownerRow?.output?.marker === "router-cycle", "owner findById did not return the payload");
assert(ownerRow?.input.query === "WH-100", "owner findById did not return the input");

const otherRow = await createSupabaseToolExecutionRepository(clientFor(otherJwt)).findById(userResult.executionId);
assert(otherRow?.status === "succeeded", "same-company user could not read status");
assert(otherRow?.output == null && Object.keys(otherRow?.input ?? {}).length === 0, "same-company user received the payload");

const foreignRow = await createSupabaseToolExecutionRepository(clientFor(otherCompanyJwt)).findById(userResult.executionId);
assert(foreignRow == null, "other company read the execution");

const service = clientFor(serviceJwt);
const seed = await service
  .from("tool_executions")
  .select("id, tool_key, status, input, output")
  .eq("id", SCHED)
  .in("tool_key", ["search_availability", "find_next_available", "recommend_appointment"])
  .eq("status", "succeeded");
assert(!seed.error, `service seed read failed ${seed.error?.message}`);
assert(seed.data?.[0]?.output?.slot === "09:00", `service seed missed output ${JSON.stringify(seed.data)}`);

const serviceResult = await router(serviceJwt).route(
  {
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    companyId: COMPANY_A,
    isSuperAdmin: false,
    hasPermission: () => true,
  },
  { conversationId: CONV, toolKey: "echo_probe", input: { source: "webhook" } },
);
assert(serviceResult.status === "succeeded", `service cycle status ${serviceResult.status} ${serviceResult.errorMessage}`);
assert(serviceResult.output?.marker === "router-cycle", "service cycle dropped its output");

const stored = await service
  .from("tool_executions")
  .select("status, input, output, created_by")
  .eq("id", serviceResult.executionId)
  .single();
assert(stored.data?.output?.marker === "router-cycle", `service row missing output ${JSON.stringify(stored.data)} ${stored.error?.message}`);
assert(stored.data?.created_by === "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "service cycle changed the expected owner");

console.log("tool router user and service_role cycles passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
