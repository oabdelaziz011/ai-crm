import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "@/lib/ai-employees/adapters/ai-employee-runtime-types";
import { hasAiEmployeesDeletePermission } from "@/lib/ai-employees/permissions";
import { AiEmployeeRegistryService } from "./ai-employee-registry-service";
import { AiEmployeeLifecycleService } from "./ai-employee-lifecycle-service";
import { AiEmployeeRegistryError } from "./ai-employee-errors";
import { AiEmployeeLifecycleError } from "./ai-employee-lifecycle-errors";
import {
  assertAiEmployeeSafeToDelete,
  employeeHasChannelRoutingTags,
  emptyDeleteDependencyResult,
  isActiveAiEmployeeStatus,
  isArchivedAiEmployeeStatus,
  isTerminalConversationState,
  isTerminalHandoffLifecycleState,
  readAiEmployeeIdFromWorkflowMemory,
  readTransferableFlowId,
  scoreEmployeeTagsForChannel,
  type AssertAiEmployeeSafeToDeleteOptions,
} from "./assert-ai-employee-safe-to-archive";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const EMP_ID = "emp-1";
const CHANNEL_ID = "chan-wa-1";
const CHANNEL_ID_IG = "chan-ig-1";

function makeEmployeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EMP_ID,
    company_id: COMPANY_A,
    name: "probe-agent",
    display_name: "Probe Agent",
    description: null,
    avatar: null,
    department: null,
    owner_id: null,
    status: "published",
    provider: "openai",
    model: "gpt-4.1",
    temperature: 0.7,
    max_tokens: 4096,
    system_prompt: "probe",
    system_prompt_summary: "probe",
    welcome_message: "",
    knowledge_source_ids: [],
    knowledge_summary: "",
    allowed_tool_keys: [],
    tool_summary: "",
    allowed_skill_ids: [],
    skills_summary: "",
    tags: ["channel:whatsapp"],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    deleted_at: null,
    created_by: null,
    updated_by: null,
    prompt_version_label: "v1",
    runtime_configuration: { ...DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION },
    published_version_id: "v1",
    current_version_number: 1,
    has_unpublished_draft: false,
    ...overrides,
  };
}

function makeChannelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANNEL_ID,
    company_id: COMPANY_A,
    display_name: "WhatsApp",
    is_enabled: true,
    deleted_at: null,
    communication_channels: { key: "whatsapp" },
    ...overrides,
  };
}

function makeInstagramChannelRow() {
  return makeChannelRow({
    id: CHANNEL_ID_IG,
    display_name: "Instagram",
    communication_channels: { key: "instagram" },
  });
}

function createFakeClient(tables: TableRows): SupabaseClient {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])] as Record<string, unknown>[];
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let inFilter: { column: string; values: unknown[] } | null = null;
    let preferSingle: "maybe" | "single" | null = null;

    const apply = () => {
      let next = rows.filter((row) => filters.every((fn) => fn(row)));
      if (inFilter) {
        next = next.filter((row) => inFilter!.values.includes(row[inFilter!.column]));
      }
      return next;
    };

    const builder: Record<string, unknown> = {};
    const api = {
      select(_cols?: string) {
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === "metadata->>aiEmployeeId") {
          filters.push((row) => {
            const metadata = row.metadata as Record<string, unknown> | null | undefined;
            return metadata?.aiEmployeeId === value;
          });
          return builder;
        }
        filters.push((row) => row[column] === value);
        return builder;
      },
      is(column: string, value: null) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        inFilter = { column, values };
        return builder;
      },
      maybeSingle() {
        preferSingle = "maybe";
        return builder;
      },
      single() {
        preferSingle = "single";
        return builder;
      },
      then(resolve: (value: { data: unknown; error: null }) => void) {
        const matched = apply();
        if (preferSingle === "maybe" || preferSingle === "single") {
          resolve({ data: matched[0] ?? null, error: null });
          return;
        }
        resolve({ data: matched, error: null });
      },
    };
    Object.assign(builder, api);
    return builder;
  };

  return { from } as unknown as SupabaseClient;
}

type TableRows = Record<string, unknown[]>;

async function runAssert(
  tables: TableRows,
  employeeId = EMP_ID,
  companyId = COMPANY_A,
  options?: AssertAiEmployeeSafeToDeleteOptions,
) {
  return assertAiEmployeeSafeToDelete(
    createFakeClient(tables),
    companyId,
    employeeId,
    options,
  );
}

function inboundSelf(): AssertAiEmployeeSafeToDeleteOptions {
  return {
    resolveInbound: async () => ({ id: EMP_ID } as AiEmployeeRecord),
  };
}

function inboundNone(): AssertAiEmployeeSafeToDeleteOptions {
  return {
    resolveInbound: async () => null,
  };
}

function inboundByChannel(channelIds: string[]): AssertAiEmployeeSafeToDeleteOptions {
  return {
    resolveInbound: async (_c, _companyId, _key, companyChannelId) =>
      channelIds.includes(companyChannelId) ? ({ id: EMP_ID } as AiEmployeeRecord) : null,
  };
}

function baseTables(employeeOverrides: Record<string, unknown> = {}): TableRows {
  return {
    ai_employees: [makeEmployeeRow(employeeOverrides)],
    company_channels: [],
    company_channel_automation_bindings: [],
    agent_workflows: [],
    conversations: [],
    channel_sessions: [],
    handoff_conversation_ownership: [],
  };
}

describe("assertAiEmployeeSafeToDelete classification helpers", () => {
  it("scores channel tags like inbound routing", () => {
    assert.equal(scoreEmployeeTagsForChannel(["channel:uuid-1"], "whatsapp", "uuid-1"), 100);
    assert.equal(scoreEmployeeTagsForChannel(["channel:whatsapp"], "whatsapp", "uuid-1"), 50);
    assert.equal(scoreEmployeeTagsForChannel(["capability:omnichannel"], "whatsapp", "uuid-1"), 10);
    assert.equal(scoreEmployeeTagsForChannel(["support"], "whatsapp", "uuid-1"), 0);
  });

  it("detects routing tags without implying live inbound", () => {
    assert.equal(employeeHasChannelRoutingTags(["channel:whatsapp"]), true);
    assert.equal(employeeHasChannelRoutingTags(["capability:omnichannel"]), true);
    assert.equal(employeeHasChannelRoutingTags(["support"]), false);
  });

  it("classifies published as active for delete", () => {
    assert.equal(isActiveAiEmployeeStatus("published"), true);
    assert.equal(isActiveAiEmployeeStatus("draft"), false);
    assert.equal(isActiveAiEmployeeStatus("disabled"), false);
    assert.equal(isActiveAiEmployeeStatus("archived"), false);
  });

  it("classifies archived as not deletable lifecycle", () => {
    assert.equal(isArchivedAiEmployeeStatus("archived"), true);
    assert.equal(isArchivedAiEmployeeStatus("draft"), false);
  });

  it("classifies closed conversations and handoffs as terminal", () => {
    assert.equal(isTerminalConversationState("closed"), true);
    assert.equal(isTerminalConversationState("waiting_user"), false);
    assert.equal(isTerminalHandoffLifecycleState("CLOSED"), true);
    assert.equal(isTerminalHandoffLifecycleState("AI_HANDLING"), false);
  });

  it("reads transferableFlowId from runtime config", () => {
    assert.equal(readTransferableFlowId({ transferableFlowId: "flow-1" } as never), "flow-1");
    assert.equal(readTransferableFlowId({ transferableFlowId: "  " } as never), null);
  });

  it("reads aiEmployeeId from active workflow memory", () => {
    assert.equal(
      readAiEmployeeIdFromWorkflowMemory({
        executionState: { pageContext: { aiEmployeeId: "emp-1" } },
      }),
      "emp-1",
    );
  });

  it("empty result allows delete", () => {
    const empty = emptyDeleteDependencyResult();
    assert.equal(empty.canDelete, true);
  });
});

describe("assertAiEmployeeSafeToDelete lifecycle-aware matrix", () => {
  it("1. ACTIVE → blocked", async () => {
    const result = await runAssert(baseTables(), EMP_ID, COMPANY_A, inboundNone());
    assert.equal(result.canDelete, false);
    assert.equal(result.isActiveEmployee, true);
    assert.equal(result.blockers.some((b) => b.type === "employee_active"), true);
  });

  it("2. ACTIVE + effective WhatsApp → blocked + WhatsApp shown", async () => {
    const result = await runAssert(
      {
        ...baseTables(),
        company_channels: [makeChannelRow()],
      },
      EMP_ID,
      COMPANY_A,
      inboundSelf(),
    );
    assert.equal(result.canDelete, false);
    assert.equal(result.isActiveEmployee, true);
    assert.deepEqual(result.effectiveChannelNames, ["WhatsApp"]);
    assert.equal(result.blockers.some((b) => b.type === "channel_inbound"), true);
  });

  it("3. ACTIVE + multiple effective channels → all shown", async () => {
    const result = await runAssert(
      {
        ...baseTables(),
        company_channels: [makeChannelRow(), makeInstagramChannelRow()],
      },
      EMP_ID,
      COMPANY_A,
      inboundByChannel([CHANNEL_ID, CHANNEL_ID_IG]),
    );
    assert.equal(result.canDelete, false);
    assert.deepEqual(result.effectiveChannelNames, ["WhatsApp", "Instagram"]);
  });

  it("4. ACTIVE without channel → blocked + disable-first", async () => {
    const result = await runAssert(baseTables(), EMP_ID, COMPANY_A, inboundNone());
    assert.equal(result.canDelete, false);
    assert.equal(result.isActiveEmployee, true);
    assert.equal(result.effectiveChannelNames?.length ?? 0, 0);
  });

  it("5. DISABLED + open conversation → DELETE ALLOWED", async () => {
    const result = await runAssert(
      {
        ...baseTables({ status: "disabled", tags: [] }),
        conversations: [
          {
            id: "conv-open",
            company_id: COMPANY_A,
            state: "waiting_user",
            deleted_at: null,
            metadata: { aiEmployeeId: EMP_ID },
          },
        ],
      },
      EMP_ID,
      COMPANY_A,
      inboundSelf(),
    );
    assert.equal(result.canDelete, true);
    assert.equal(result.blockers.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it("6. DRAFT + open conversation → DELETE ALLOWED", async () => {
    const result = await runAssert(
      {
        ...baseTables({ status: "draft", tags: [] }),
        conversations: [
          {
            id: "conv-open",
            company_id: COMPANY_A,
            state: "idle",
            deleted_at: null,
            metadata: { aiEmployeeId: EMP_ID },
          },
        ],
      },
      EMP_ID,
      COMPANY_A,
      inboundSelf(),
    );
    assert.equal(result.canDelete, true);
    assert.equal(result.blockers.length, 0);
  });

  it("6. ARCHIVED → blocked (use Restore, not Delete)", async () => {
    const result = await runAssert(
      baseTables({ status: "archived", tags: [] }),
      EMP_ID,
      COMPANY_A,
      inboundNone(),
    );
    assert.equal(result.canDelete, false);
    assert.equal(result.alreadyArchived, true);
  });

  it("7. DISABLED + workflow reference → DELETE ALLOWED", async () => {
    const result = await runAssert(
      {
        ...baseTables({ status: "disabled", tags: [] }),
        agent_workflows: [
          {
            id: "wf-1",
            company_id: COMPANY_A,
            status: "running",
            goal: "Probe run",
            memory: { executionState: { pageContext: { aiEmployeeId: EMP_ID } } },
          },
        ],
      },
      EMP_ID,
      COMPANY_A,
      inboundNone(),
    );
    assert.equal(result.canDelete, true);
    assert.equal(result.blockers.length, 0);
  });

  it("8. DRAFT + channel tags → DELETE ALLOWED", async () => {
    const result = await runAssert(
      {
        ...baseTables({ status: "draft", tags: ["channel:whatsapp", "capability:omnichannel"] }),
        company_channels: [makeChannelRow()],
      },
      EMP_ID,
      COMPANY_A,
      inboundSelf(),
    );
    assert.equal(result.canDelete, true);
    assert.equal(result.blockers.length, 0);
  });

  it("9. NON-ACTIVE + transferableFlowId → DELETE ALLOWED", async () => {
    const result = await runAssert(
      {
        ...baseTables({
          status: "disabled",
          tags: [],
          runtime_configuration: {
            ...DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
            transferableFlowId: "flow-transfer-1",
          },
        }),
      },
      EMP_ID,
      COMPANY_A,
      inboundNone(),
    );
    assert.equal(result.canDelete, true);
    assert.equal(result.warnings.length, 0);
  });

  it("10. NON-ACTIVE + sessions/handoffs → DELETE ALLOWED", async () => {
    const result = await runAssert(
      {
        ...baseTables({ status: "draft", tags: [] }),
        channel_sessions: [
          {
            id: "sess-1",
            company_id: COMPANY_A,
            channel_key: "whatsapp",
            session_status: "active",
            metadata: { aiEmployeeEngagement: { aiEmployeeId: EMP_ID } },
          },
        ],
        handoff_conversation_ownership: [
          {
            id: "ho-1",
            company_id: COMPANY_A,
            conversation_id: "conv-1",
            owner_type: "ai_employee",
            owner_id: EMP_ID,
            owner_label: "Probe",
            lifecycle_state: "AI_HANDLING",
          },
        ],
      },
      EMP_ID,
      COMPANY_A,
      inboundNone(),
    );
    assert.equal(result.canDelete, true);
    assert.equal(result.blockers.length, 0);
  });

  it("11. cross-tenant → fail closed", async () => {
    const result = await runAssert(
      baseTables({ company_id: COMPANY_A }),
      EMP_ID,
      COMPANY_B,
      inboundNone(),
    );
    assert.equal(result.canDelete, false);
    assert.match(result.blockers[0]?.reason ?? "", /not found/i);
  });

  it("12. unauthorized → denied by existing permission helper", () => {
    const has = (code: string) => code === "agents.view";
    assert.equal(hasAiEmployeesDeletePermission(has, false), false);
    assert.equal(hasAiEmployeesDeletePermission(() => false, true), true);
  });
});

describe("delete service gating", () => {
  it("13. race: disabled → active before mutation → BLOCK", async () => {
    let readCount = 0;
    const row = makeEmployeeRow({ status: "disabled", tags: [] });
    const repository = {
      client: createFakeClient({
        ai_employees: [row],
        company_channels: [],
        company_channel_automation_bindings: [],
      }),
      getById: async () => {
        readCount += 1;
        if (readCount >= 2) {
          return { ...row, status: "published" };
        }
        return row;
      },
      softDelete: async () => undefined,
    };

    const registry = new AiEmployeeRegistryService(repository as never);
    await assert.rejects(
      () => registry.softDelete(EMP_ID, COMPANY_A),
      (error: unknown) => {
        assert.ok(error instanceof AiEmployeeRegistryError);
        assert.equal(error.code, "delete_blocked");
        return true;
      },
    );
  });

  it("14. successful delete → softDelete called for non-active", async () => {
    const row = makeEmployeeRow({ status: "disabled", tags: [] });
    let softDeleteCalled = false;
    const repository = {
      client: createFakeClient({
        ai_employees: [row],
        company_channels: [],
        company_channel_automation_bindings: [],
        agent_workflows: [],
        conversations: [
          {
            id: "conv-open",
            company_id: COMPANY_A,
            state: "waiting_user",
            deleted_at: null,
            metadata: { aiEmployeeId: EMP_ID },
          },
        ],
        channel_sessions: [],
        handoff_conversation_ownership: [],
      }),
      getById: async () => row,
      softDelete: async () => {
        softDeleteCalled = true;
      },
    };

    const registry = new AiEmployeeRegistryService(repository as never);
    await registry.softDelete(EMP_ID, COMPANY_A);
    assert.equal(softDeleteCalled, true);
  });

  it("15. ACTIVE registry softDelete throws delete_blocked (no auto unlink)", async () => {
    const row = makeEmployeeRow({ tags: [] });
    let softDeleteCalled = false;
    const repository = {
      client: createFakeClient({
        ai_employees: [row],
        company_channels: [],
        company_channel_automation_bindings: [],
        agent_workflows: [],
        conversations: [
          {
            id: "conv-open",
            company_id: COMPANY_A,
            state: "waiting_user",
            deleted_at: null,
            metadata: { aiEmployeeId: EMP_ID },
          },
        ],
        channel_sessions: [],
        handoff_conversation_ownership: [],
      }),
      getById: async () => row,
      softDelete: async () => {
        softDeleteCalled = true;
      },
    };

    const registry = new AiEmployeeRegistryService(repository as never);
    await assert.rejects(
      () => registry.softDelete(EMP_ID, COMPANY_A),
      (error: unknown) => {
        assert.ok(error instanceof AiEmployeeRegistryError);
        assert.equal(error.code, "delete_blocked");
        return true;
      },
    );
    assert.equal(softDeleteCalled, false);
  });

  it("archived registry softDelete throws already_archived", async () => {
    const row = makeEmployeeRow({ status: "archived", tags: [] });
    const repository = {
      client: createFakeClient({
        ai_employees: [row],
        company_channels: [],
        company_channel_automation_bindings: [],
      }),
      getById: async () => row,
      softDelete: async () => {
        throw new Error("softDelete should not run");
      },
    };

    const registry = new AiEmployeeRegistryService(repository as never);
    await assert.rejects(
      () => registry.softDelete(EMP_ID, COMPANY_A),
      (error: unknown) => {
        assert.ok(error instanceof AiEmployeeRegistryError);
        assert.equal(error.code, "already_archived");
        return true;
      },
    );
  });

  it("lifecycle.archive allows disabled with open conversation", async () => {
    let softDeleteCalled = false;
    const employees = {
      client: createFakeClient({
        ai_employees: [makeEmployeeRow({ status: "disabled", tags: [] })],
        company_channels: [],
        company_channel_automation_bindings: [],
        agent_workflows: [],
        conversations: [
          {
            id: "conv-open",
            company_id: COMPANY_A,
            state: "waiting_user",
            deleted_at: null,
            metadata: { aiEmployeeId: EMP_ID },
          },
        ],
        channel_sessions: [],
        handoff_conversation_ownership: [],
      }),
      getById: async () => makeEmployeeRow({ status: "disabled", tags: [] }),
      softDelete: async () => {
        softDeleteCalled = true;
      },
    };

    const lifecycle = new AiEmployeeLifecycleService(
      {} as never,
      employees as never,
      {
        recordChangeEvent: async () => undefined,
      } as never,
      {} as never,
    );

    await lifecycle.archive(EMP_ID, COMPANY_A);
    assert.equal(softDeleteCalled, true);
  });

  it("registry and lifecycle import the assert helper; dialog uses active blocked copy", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const registry = readFileSync(resolve(here, "ai-employee-registry-service.ts"), "utf8");
    const lifecycle = readFileSync(resolve(here, "ai-employee-lifecycle-service.ts"), "utf8");
    const dialog = readFileSync(resolve(here, "../components/ai-employee-delete-dialog.tsx"), "utf8");
    const wizard = readFileSync(
      resolve(here, "../../../pages/dashboard/agents/agent-create-wizard-page.tsx"),
      "utf8",
    );
    assert.match(registry, /assertAiEmployeeSafeToDelete/);
    assert.match(lifecycle, /assertAiEmployeeSafeToDelete/);
    assert.match(dialog, /activeBlockedTitle/);
    assert.match(dialog, /alreadyArchived/);
    assert.match(wizard, /resolveWizardDraftPersistDecision/);
    assert.match(wizard, /draftNotFound/);
    assert.match(wizard, /isArchivedAiEmployeeStatus/);
  });
});
