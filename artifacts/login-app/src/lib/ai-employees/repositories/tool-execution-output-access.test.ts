import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiEmployeeOperationsRepository } from "./ai-employee-operations-repository";
import { AiEmployeeSkillRepository } from "./ai-employee-skill-repository";

function recordingClient(selects: string[]) {
  const builder = {
    select(columns: string) {
      selects.push(columns);
      return builder;
    },
    eq() {
      return builder;
    },
    in() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
  };
  return {
    from() {
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("tool execution reads used by employee surfaces", () => {
  it("does not select execution input or output", async () => {
    const selects: string[] = [];
    const client = recordingClient(selects);
    await new AiEmployeeOperationsRepository(client).listToolExecutions("company-1");
    await new AiEmployeeSkillRepository(client).listToolExecutions("company-1", ["search_products"]);
    assert.equal(selects.length, 2);
    for (const columns of selects) {
      assert.equal(columns.split(",").some((column) => column.trim() === "output"), false);
      assert.equal(columns.split(",").some((column) => column.trim() === "input"), false);
    }
  });
});
