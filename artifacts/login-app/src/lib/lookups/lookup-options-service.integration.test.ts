import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveListNodeSections, type AutomationNodeRecord } from "@workspace/automation-platform";
import { createLookupOptionsPort } from "./create-lookup-options-port";
import { fetchLookupOptions } from "./lookup-options-service";

const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const ACTIVE_SERVICE = {
  id: "a8a6403e-4c88-48ae-aa46-d204ea8ef49d",
  company_id: COMPANY_ID,
  name: "Clinic Visit",
  description: "",
  duration_minutes: 30,
  status: "active",
  deleted_at: null,
};

type MockClientRole = "service_role" | "anon";

function createMockSupabaseClient(role: MockClientRole): SupabaseClient {
  const tables: Record<string, Record<string, unknown>[]> = {
    scheduling_services: role === "service_role" ? [ACTIVE_SERVICE] : [],
  };

  function queryTable(table: string) {
    let rows = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    const finalize = async () => ({ data: rows, error: null });

    builder.select = () => builder;
    builder.eq = (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    };
    builder.is = (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    };
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.maybeSingle = finalize;
    builder.single = finalize;
    builder.then = (
      onFulfilled?: ((value: unknown) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => finalize().then(onFulfilled ?? undefined, onRejected ?? undefined);

    return builder;
  }

  return {
    from: (table: string) => queryTable(table),
  } as unknown as SupabaseClient;
}

const listLookupConfig = {
  lookup: "services" as const,
  displayField: "name",
  valueField: "id",
  filters: {},
};

const listNode: AutomationNodeRecord = {
  id: "8db28bb9-162e-4049-8539-d4a29d75bc9f",
  flow_id: "aef7c4ab-513a-4b64-a700-2be6cf51dafc",
  type: "action",
  config: {
    action: "send_list",
    builderType: "list",
    mode: "lookup",
    lookup: "services",
    displayField: "name",
    valueField: "id",
    filters: {},
    inputKey: "selected_service",
    outputVariable: "selected_service",
    title: "Choose a service",
  },
  position_x: 0,
  position_y: 0,
  created_at: new Date().toISOString(),
};

describe("lookup-backed list node webhook runtime", () => {
  it("returns one service option when using the injected service-role client", async () => {
    const serviceRoleClient = createMockSupabaseClient("service_role");
    const lookupOptions = createLookupOptionsPort(serviceRoleClient);

    const rows = await fetchLookupOptions(COMPANY_ID, listLookupConfig, serviceRoleClient);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, ACTIVE_SERVICE.id);
    assert.equal(rows[0]?.title, ACTIVE_SERVICE.name);

    const sections = await resolveListNodeSections(listNode, COMPANY_ID, lookupOptions, {});
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.rows.length, 1);
    assert.equal(sections[0]?.rows[0]?.id, ACTIVE_SERVICE.id);
    assert.equal(sections[0]?.rows[0]?.title, ACTIVE_SERVICE.name);
  });

  it("returns no options with anon client and resolveListNodeSections throws", async () => {
    const anonClient = createMockSupabaseClient("anon");
    const lookupOptions = createLookupOptionsPort(anonClient);

    const rows = await fetchLookupOptions(COMPANY_ID, listLookupConfig, anonClient);
    assert.equal(rows.length, 0);

    await assert.rejects(
      () => resolveListNodeSections(listNode, COMPANY_ID, lookupOptions, {}),
      /Lookup-backed list node returned no options\./,
    );
  });
});
