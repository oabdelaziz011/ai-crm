import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseToolExecutionRepository } from "./supabase-tool-repositories.js";

type Call = { op: "select" | "rpc"; value: string };

function fakeClient(options?: {
  rpcResult?: unknown;
  rpcError?: { code: string; message: string } | null;
}): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const row = {
    id: "exec-1",
    company_id: "company-1",
    conversation_id: "conv-1",
    tool_definition_id: "tool-1",
    tool_key: "search_products",
    status: "succeeded",
    error_code: null,
    error_message: null,
    started_at: "2026-10-15T00:00:00.000Z",
    completed_at: null,
    duration_ms: 12,
    triggered_by: "router",
    created_by: "user-1",
  };
  const builder = {
    select(columns: string) {
      calls.push({ op: "select", value: columns });
      return builder;
    },
    insert() {
      return builder;
    },
    update() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    single() {
      return Promise.resolve({ data: row, error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: row, error: null });
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve({ data: [row], error: null }).then(resolve);
    },
  };
  const client = {
    from() {
      return builder;
    },
    rpc(name: string) {
      calls.push({ op: "rpc", value: name });
      return Promise.resolve({
        data: options?.rpcResult ?? null,
        error: options?.rpcError ?? null,
      });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

function selectedColumns(calls: Call[]): string[] {
  return calls.filter((call) => call.op === "select").flatMap((call) => call.value.split(",").map((column) => column.trim()));
}

describe("tool execution repository column boundary", () => {
  it("writes and lists without selecting input or output", async () => {
    const { client, calls } = fakeClient();
    const repository = createSupabaseToolExecutionRepository(client);
    const created = await repository.create({
      companyId: "company-1",
      conversationId: "conv-1",
      toolDefinitionId: "tool-1",
      toolKey: "search_products",
      input: { query: "WH-100" },
      createdBy: "user-1",
    });
    const completed = await repository.complete({
      executionId: "exec-1",
      status: "succeeded",
      output: { products: [{ price: { status: "not_listed" } }] },
      durationMs: 12,
    });
    const listed = await repository.list({ companyId: "company-1" });

    assert.equal(created.input.query, "WH-100");
    assert.equal(created.output, null);
    assert.equal((completed.output as { products: unknown[] }).products.length, 1);
    assert.equal(listed[0].output, null);
    assert.deepEqual(listed[0].input, {});
    assert.equal(calls.some((call) => call.op === "rpc"), false);
    for (const column of selectedColumns(calls)) {
      assert.equal(column === "input" || column === "output", false);
    }
  });

  it("loads payload only from the owner function and ignores a missing function", async () => {
    const visible = fakeClient({
      rpcResult: { input: { query: "WH-100" }, output: { products: [] } },
    });
    const own = await createSupabaseToolExecutionRepository(visible.client).findById("exec-1");
    assert.equal(own?.input.query, "WH-100");
    assert.deepEqual(visible.calls.filter((call) => call.op === "rpc").map((call) => call.value), ["read_own_tool_execution"]);

    const missing = fakeClient({ rpcError: { code: "PGRST202", message: "missing" } });
    const hidden = await createSupabaseToolExecutionRepository(missing.client).findById("exec-1");
    assert.deepEqual(hidden?.input, {});
    assert.equal(hidden?.output, null);
    assert.equal(selectedColumns(missing.calls).includes("output"), false);
  });
});
