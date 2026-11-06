import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseConversationRepository } from "./supabase-conversation-repository.ts";

function row(unread: number): Record<string, unknown> {
  return {
    id: "conv-1",
    company_id: "company-1",
    conversation_number: "C-1",
    company_channel_id: null,
    ai_assistant_id: "asst-1",
    channel_type: "web_chat",
    channel_instance_id: null,
    state: "idle",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: null,
    department_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: unread,
    unread_count_customer: 0,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: null,
    search_text: "",
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    updated_by: "user-a",
    deleted_at: null,
    deleted_by: null,
  };
}

function client(storedUnread: number): { supabase: SupabaseClient; updates: Array<Record<string, unknown>>; filters: unknown[][] } {
  const updates: Array<Record<string, unknown>> = [];
  const filters: unknown[][] = [];
  const supabase = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          const chain = {
            eq(column: string, value: unknown) {
              filters.push(["eq", column, value]);
              return chain;
            },
            is(column: string, value: unknown) {
              filters.push(["is", column, value]);
              return chain;
            },
            select() {
              return chain;
            },
            maybeSingle: async () => ({
              data: storedUnread === 0 ? row(1) : null,
              error: null,
            }),
          };
          return chain;
        },
        select() {
          const chain = {
            eq() {
              return chain;
            },
            is() {
              return chain;
            },
            maybeSingle: async () => ({ data: row(storedUnread), error: null }),
          };
          return chain;
        },
      };
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, updates, filters };
}

describe("conversation repository employee unread", () => {
  it("sets a zero employee unread count to one", async () => {
    const fake = client(0);
    const repository = createSupabaseConversationRepository(fake.supabase);
    const updated = await repository.markEmployeeUnread("conv-1", "user-a");
    assert.equal(updated.unread_count_employee, 1);
    assert.equal(fake.updates[0]?.unread_count_employee, 1);
    assert.equal(fake.updates[0]?.updated_by, "user-a");
    assert.deepEqual(fake.filters, [
      ["eq", "id", "conv-1"],
      ["is", "deleted_at", null],
      ["eq", "unread_count_employee", 0],
    ]);
  });

  it("keeps an existing employee unread count", async () => {
    const fake = client(4);
    const repository = createSupabaseConversationRepository(fake.supabase);
    const updated = await repository.markEmployeeUnread("conv-1", "user-a");
    assert.equal(updated.unread_count_employee, 4);
    assert.equal(fake.updates.length, 1);
  });
});
