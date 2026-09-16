import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachTicketContextsToConversations,
  batchConversationActiveTicketContexts,
  type ConversationTicketContext,
} from "./conversation-ticket-context.ts";

function fluentClient(rows: Array<Record<string, unknown>>) {
  const terminal = {
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["select", "eq", "in", "is", "order"]) {
    chain[method] = () => self();
  }
  Object.assign(chain, terminal);
  return {
    from: (table: string) => {
      assert.equal(table, "support_tickets");
      return chain;
    },
  };
}

describe("conversation ticket context batching", () => {
  it("O. loads active tickets in one query and picks newest per conversation", async () => {
    const map = await batchConversationActiveTicketContexts({
      client: fluentClient([
        {
          id: "t-new",
          ticket_number: "TKT-2",
          subject: "Newer",
          status: "open",
          priority: "high",
          sla_due_at: "2026-09-05T20:00:00.000Z",
          conversation_id: "c1",
          company_id: "co-a",
          created_at: "2026-09-05T12:00:00.000Z",
        },
        {
          id: "t-old",
          ticket_number: "TKT-1",
          subject: "Older",
          status: "in_progress",
          priority: "normal",
          sla_due_at: "2026-09-05T18:00:00.000Z",
          conversation_id: "c1",
          company_id: "co-a",
          created_at: "2026-09-05T10:00:00.000Z",
        },
      ]) as never,
      companyId: "co-a",
      conversationIds: ["c1", "c2", "c1"],
    });

    assert.equal(map.size, 1);
    assert.equal(map.get("c1")?.ticketNumber, "TKT-2");
    assert.equal(map.get("c1")?.ticketId, "t-new");
    assert.equal(map.has("c2"), false);
  });

  it("M. ignores tickets whose company_id does not match request company", async () => {
    const map = await batchConversationActiveTicketContexts({
      client: fluentClient([
        {
          id: "t1",
          ticket_number: "TKT-1",
          subject: "x",
          status: "open",
          priority: "normal",
          sla_due_at: "2026-09-05T18:00:00.000Z",
          conversation_id: "c1",
          company_id: "co-other",
          created_at: "2026-09-05T10:00:00.000Z",
        },
      ]) as never,
      companyId: "co-a",
      conversationIds: ["c1"],
    });
    assert.equal(map.size, 0);
  });

  it("N. attaches newest active ticket per conversation without inventing", () => {
    const ctx: ConversationTicketContext = {
      ticketId: "t1",
      ticketNumber: "TKT-1",
      subject: "A",
      status: "open",
      priority: "high",
      slaDueAt: "2026-09-05T18:00:00.000Z",
      isActive: true,
    };
    const rows = attachTicketContextsToConversations(
      [{ id: "c1" }, { id: "c2" }],
      new Map([["c1", ctx]]),
    );
    assert.equal(rows[0]!.ticketContext?.ticketId, "t1");
    assert.equal(rows[1]!.ticketContext, null);
  });
});
