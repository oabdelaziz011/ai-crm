import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
  readInteractiveListPaginationState,
} from "../runtime/interactive-list-pagination.js";
import { createBuiltInAutomationNodeHandlers } from "../engine/built-in-nodes.js";
import type { ExecutionContext } from "../engine/execution-context.js";
import type { AutomationNodeRecord, AutomationRunRecord, ConversationSessionRecord } from "../types.js";

function makeContext(input: {
  node: AutomationNodeRecord;
  variables?: Record<string, unknown>;
  resume?: Record<string, unknown>;
  channel?: ConversationSessionRecord["channel"];
}): ExecutionContext {
  const run: AutomationRunRecord = {
    id: "run-1",
    company_id: "company-1",
    flow_id: "flow-1",
    status: "running",
    trigger_source: "inbound_message",
    started_at: new Date().toISOString(),
    finished_at: null,
    error_message: null,
    metadata: {},
    flow_version_id: "version-1",
    current_node_id: input.node.id,
    session_id: "session-1",
    variables: input.variables ?? {},
  };
  const session: ConversationSessionRecord = {
    id: "session-1",
    company_id: "company-1",
    channel: input.channel ?? "whatsapp",
    external_user_id: "201023169075",
    customer_id: null,
    flow_id: "flow-1",
    flow_version_id: "version-1",
    run_id: "run-1",
    current_node_id: input.node.id,
    status: "active",
    started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    metadata: {},
    variables: input.variables ?? {},
  };

  return {
    company: { id: "company-1" },
    flow: {
      id: "flow-1",
      company_id: "company-1",
      name: "List Pagination Flow",
      description: "",
      trigger_type: "inbound_message",
      status: "active",
      version: 1,
      active_version_id: "version-1",
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    },
    run,
    session,
    variables: input.variables ?? {},
    customer: { id: null },
    currentNode: input.node,
    nodes: [input.node],
    edges: [],
    input: input.resume,
  };
}

describe("interactive list pagination engine integration", () => {
  const lookupOptions = {
    async fetchListOptions() {
      return Array.from({ length: 11 }, (_, index) => ({
        id: `slot_${index + 1}`,
        title: `${index + 1}:00 PM`,
        description: `${index + 1}:00 PM · 30 min`,
        value: `slot_${index + 1}`,
        record: { start_at: `2026-08-02T19:${String(index).padStart(2, "0")}:00.000Z`, slot: index + 1 },
      }));
    },
  };

  const handlers = createBuiltInAutomationNodeHandlers({ lookupOptions });
  const listHandler = handlers.find((handler) => handler.type === "action");
  assert.ok(listHandler);

  const listNode: AutomationNodeRecord = {
    id: "node-times",
    flow_id: "flow-1",
    type: "action",
    config: {
      action: "send_list",
      mode: "lookup",
      lookup: "available_slots",
      title: "Choose suitable time",
      body: "Pick the option that fits you best.",
      buttonLabel: "View options",
      displayField: "title",
      valueField: "id",
      outputVariable: "selected_slot",
      inputKey: "selected_slot",
    },
    position_x: 0,
    position_y: 0,
    created_at: new Date().toISOString(),
  };

  it("paginates eleven lookup rows into a ten-row WhatsApp page with Next", async () => {
    const result = await listHandler!.execute(makeContext({ node: listNode }));
    assert.equal(result.outcome, "waiting_input");
    const outbound = result.variables?.__outbound as { kind?: string; sections?: Array<{ rows: Array<{ id: string }> }> };
    assert.equal(outbound?.kind, "list");
    assert.equal(outbound?.sections?.[0]?.rows.length, 10);
    assert.equal(outbound?.sections?.[0]?.rows.at(-1)?.id, INTERACTIVE_LIST_NEXT_PAGE_ROW_ID);

    const pagination = readInteractiveListPaginationState(result.variables ?? {}, listNode.id);
    assert.equal(pagination?.totalPages, 2);
    assert.equal(pagination?.rows.length, 11);
  });

  it("serves the second page when the user selects Next", async () => {
    const firstPage = await listHandler!.execute(makeContext({ node: listNode }));
    const secondPage = await listHandler!.execute(
      makeContext({
        node: listNode,
        variables: firstPage.variables,
        resume: {
          kind: "interactive_reply",
          replyId: INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
          title: "Next",
          interactionType: "list_reply",
        },
      }),
    );

    assert.equal(secondPage.outcome, "waiting_input");
    const outbound = secondPage.variables?.__outbound as { sections?: Array<{ rows: Array<{ id: string }> }> };
    assert.equal(outbound?.sections?.[0]?.rows.length, 2);
    assert.equal(outbound?.sections?.[0]?.rows.some((row) => row.id === INTERACTIVE_LIST_NEXT_PAGE_ROW_ID), false);
  });

  it("persists catalog and restores full slot record for non-paginated lists", async () => {
    const smallLookup = {
      async fetchListOptions() {
        return [
          {
            id: "2026-08-05T09:00:00.000Z",
            title: "9:00 AM",
            value: "2026-08-05T09:00:00.000Z",
            record: {
              start_at: "2026-08-05T09:00:00.000Z",
              display_time: "9:00 AM",
              service_id: "svc-1",
              resource_id: "res-1",
              timezone: "UTC",
            },
          },
          {
            id: "2026-08-05T10:00:00.000Z",
            title: "10:00 AM",
            value: "2026-08-05T10:00:00.000Z",
            record: {
              start_at: "2026-08-05T10:00:00.000Z",
              display_time: "10:00 AM",
              service_id: "svc-1",
              resource_id: "res-1",
              timezone: "UTC",
            },
          },
        ];
      },
    };
    const handlers = createBuiltInAutomationNodeHandlers({ lookupOptions: smallLookup });
    const handler = handlers.find((entry) => entry.type === "action");
    assert.ok(handler);

    const waiting = await handler!.execute(makeContext({ node: listNode }));
    assert.equal(waiting.outcome, "waiting_input");
    const catalog = readInteractiveListPaginationState(waiting.variables ?? {}, listNode.id);
    assert.ok(catalog);
    assert.equal(catalog?.totalPages, 1);
    assert.equal(catalog?.rows.length, 2);
    assert.ok(catalog?.rows[0]?.record);

    const selected = await handler!.execute(
      makeContext({
        node: listNode,
        variables: waiting.variables,
        resume: {
          kind: "interactive_reply",
          replyId: "2026-08-05T10:00:00.000Z",
          title: "10:00 AM",
          interactionType: "list_reply",
        },
      }),
    );

    assert.equal(selected.outcome, "continue");
    assert.deepEqual(selected.variables?.selected_slot, {
      start_at: "2026-08-05T10:00:00.000Z",
      display_time: "10:00 AM",
      service_id: "svc-1",
      resource_id: "res-1",
      timezone: "UTC",
    });
  });

  it("rejects unknown reply ids with a user-friendly wait instead of a bare string", async () => {
    const smallLookup = {
      async fetchListOptions() {
        return [
          {
            id: "2026-08-05T09:00:00.000Z",
            title: "9:00 AM",
            value: "2026-08-05T09:00:00.000Z",
            record: {
              start_at: "2026-08-05T09:00:00.000Z",
              display_time: "9:00 AM",
              service_id: "svc-1",
              resource_id: "res-1",
              timezone: "UTC",
            },
          },
        ];
      },
    };
    const handlers = createBuiltInAutomationNodeHandlers({ lookupOptions: smallLookup });
    const handler = handlers.find((entry) => entry.type === "action");
    assert.ok(handler);

    const waiting = await handler!.execute(makeContext({ node: listNode }));
    const rejected = await handler!.execute(
      makeContext({
        node: listNode,
        variables: waiting.variables,
        resume: {
          kind: "interactive_reply",
          replyId: "2026-08-05",
          title: "Wed, Aug 5, 2026",
          interactionType: "list_reply",
        },
      }),
    );

    assert.equal(rejected.outcome, "waiting_input");
    assert.notEqual(typeof rejected.variables?.selected_slot, "string");
    assert.match(String(rejected.variables?.__prompt ?? ""), /no longer available/i);
  });

  it("stores the selected row from a later page using cached pagination rows", async () => {
    const firstPage = await listHandler!.execute(makeContext({ node: listNode }));
    const secondPage = await listHandler!.execute(
      makeContext({
        node: listNode,
        variables: firstPage.variables,
        resume: {
          kind: "interactive_reply",
          replyId: INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
          title: "Next",
          interactionType: "list_reply",
        },
      }),
    );

    const selection = await listHandler!.execute(
      makeContext({
        node: listNode,
        variables: secondPage.variables,
        resume: {
          kind: "interactive_reply",
          replyId: "slot_11",
          title: "11:00 PM",
          interactionType: "list_reply",
        },
      }),
    );

    assert.equal(selection.outcome, "continue");
    assert.deepEqual(selection.variables?.selected_slot, {
      start_at: "2026-08-02T19:10:00.000Z",
      slot: 11,
    });
  });
});
