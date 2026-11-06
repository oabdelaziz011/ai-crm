import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_PERMISSIONS } from "../constants.ts";
import { ConversationNotFoundError, PermissionDeniedError } from "../errors.ts";
import type { ConversationRecord, ServiceContext } from "../types.ts";
import { ConversationService } from "./conversation-service.ts";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "user-a",
    companyId: partial.companyId ?? "company-1",
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
    departmentId: partial.departmentId,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: overrides.id ?? "conv-1",
    company_id: overrides.company_id ?? "company-1",
    conversation_number: overrides.conversation_number ?? "C-1",
    company_channel_id: overrides.company_channel_id ?? null,
    ai_assistant_id: overrides.ai_assistant_id ?? "asst-1",
    channel_type: overrides.channel_type ?? "web_chat",
    channel_instance_id: overrides.channel_instance_id ?? null,
    state: overrides.state ?? "idle",
    external_thread_id: overrides.external_thread_id ?? null,
    customer_id: overrides.customer_id ?? null,
    assigned_user_id: overrides.assigned_user_id ?? null,
    department_id: overrides.department_id ?? null,
    metadata: overrides.metadata ?? {},
    priority: overrides.priority ?? "normal",
    locked_by: overrides.locked_by ?? null,
    locked_at: overrides.locked_at ?? null,
    unread_count_employee: overrides.unread_count_employee ?? 0,
    unread_count_customer: overrides.unread_count_customer ?? 0,
    last_message_at: overrides.last_message_at ?? null,
    last_message_preview: overrides.last_message_preview ?? null,
    last_participant_type: overrides.last_participant_type ?? null,
    search_text: overrides.search_text ?? "",
    started_at: overrides.started_at ?? new Date().toISOString(),
    ended_at: overrides.ended_at ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    created_by: overrides.created_by ?? null,
    updated_by: overrides.updated_by ?? null,
    deleted_at: overrides.deleted_at ?? null,
    deleted_by: overrides.deleted_by ?? null,
  };
}

function canRead(code: string): boolean {
  return code === CONVERSATION_PERMISSIONS.view || code === CONVERSATION_PERMISSIONS.viewAssigned;
}

describe("ConversationService employee unread", () => {
  it("marks a read conversation unread and leaves an existing count unchanged", async () => {
    const writes: number[] = [];
    let current = conversation({ unread_count_employee: 0 });
    const service = new ConversationService({
      findById: async () => current,
      resetEmployeeUnread: async () => {
        current = conversation({ unread_count_employee: 0 });
        return current;
      },
      markEmployeeUnread: async () => {
        const next = current.unread_count_employee > 0 ? current.unread_count_employee : 1;
        writes.push(next);
        current = conversation({ unread_count_employee: next });
        return current;
      },
    } as never);

    const reader = ctx({ hasPermission: canRead });
    const unread = await service.markEmployeeUnread(reader, "conv-1");
    assert.equal(unread.unread_count_employee, 1);
    current = conversation({ unread_count_employee: 4 });
    const kept = await service.markEmployeeUnread(reader, "conv-1");
    assert.equal(kept.unread_count_employee, 4);
    assert.deepEqual(writes, [1, 4]);

    const read = await service.resetEmployeeUnread(reader, "conv-1");
    assert.equal(read.unread_count_employee, 0);
    const again = await service.markEmployeeUnread(reader, "conv-1");
    assert.equal(again.unread_count_employee, 1);
  });

  it("rejects another company and a caller without read permission", async () => {
    let writes = 0;
    const service = new ConversationService({
      findById: async () => conversation(),
      markEmployeeUnread: async () => {
        writes += 1;
        return conversation({ unread_count_employee: 1 });
      },
    } as never);

    await assert.rejects(
      () => service.markEmployeeUnread(ctx({ companyId: "company-2", hasPermission: canRead }), "conv-1"),
      PermissionDeniedError,
    );
    await assert.rejects(
      () => service.markEmployeeUnread(ctx({ hasPermission: () => false }), "conv-1"),
      PermissionDeniedError,
    );
    assert.equal(writes, 0);
  });

  it("hides a conversation outside assigned visibility and a missing row", async () => {
    const service = new ConversationService({
      findById: async (id: string) => (id === "missing" ? null : conversation({ assigned_user_id: "someone-else" })),
      markEmployeeUnread: async () => conversation({ unread_count_employee: 1 }),
    } as never);
    const assignedOnly = ctx({
      userId: "user-a",
      hasPermission: (code) => code === CONVERSATION_PERMISSIONS.viewAssigned,
    });
    await assert.rejects(
      () => service.markEmployeeUnread(assignedOnly, "conv-1"),
      ConversationNotFoundError,
    );
    await assert.rejects(
      () => service.markEmployeeUnread(ctx({ hasPermission: canRead }), "missing"),
      ConversationNotFoundError,
    );
  });

  it("does not report success when the unread write does not persist", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ unread_count_employee: 0 }),
      markEmployeeUnread: async () => conversation({ unread_count_employee: 0 }),
    } as never);
    await assert.rejects(
      () => service.markEmployeeUnread(ctx({ hasPermission: canRead }), "conv-1"),
      PermissionDeniedError,
    );
  });
});
