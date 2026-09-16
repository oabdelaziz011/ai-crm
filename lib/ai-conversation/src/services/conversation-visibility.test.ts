/**
 * Conversation read visibility — View All vs View Assigned (+ department / manager).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONVERSATION_PERMISSIONS } from "../constants.ts";
import { ConversationNotFoundError, PermissionDeniedError } from "../errors.ts";
import type { ConversationRecord, ServiceContext } from "../types.ts";
import { ConversationService } from "./conversation-service.ts";
import {
  applyConversationListVisibilityFilter,
  assertCanReadConversations,
  assertConversationReadable,
  canViewAllConversations,
  canViewAssignedConversations,
  isConversationVisibleToScope,
  resolveConversationReadScope,
} from "./conversation-visibility.ts";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "user-a",
    companyId: partial.companyId ?? "company-1",
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
    departmentId: partial.departmentId,
    managedDepartmentIds: partial.managedDepartmentIds,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: overrides.id ?? "conv-1",
    company_id: overrides.company_id ?? "company-1",
    conversation_number: overrides.conversation_number ?? "C-1",
    company_channel_id: overrides.company_channel_id ?? null,
    ai_assistant_id: overrides.ai_assistant_id ?? "asst-1",
    channel_type: overrides.channel_type ?? "email",
    channel_instance_id: overrides.channel_instance_id ?? null,
    state: overrides.state ?? "waiting_user",
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

const SALES = "dept-sales";
const SUPPORT = "dept-support";
const CS = "dept-cs";

describe("conversation-visibility helper", () => {
  it("L. View All wins over View Assigned", () => {
    const scope = resolveConversationReadScope(
      ctx({
        hasPermission: (p) =>
          p === CONVERSATION_PERMISSIONS.view || p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(scope.mode, "all");
    assert.equal(canViewAllConversations(ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view })), true);
  });

  it("View Assigned alone yields assigned scope with dept + managed", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        managedDepartmentIds: [CS],
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.deepEqual(scope, {
      mode: "assigned",
      userId: "agent-a",
      departmentId: SALES,
      managedDepartmentIds: [CS],
    });
    assert.equal(
      canViewAssignedConversations(
        ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned }),
      ),
      true,
    );
  });

  it("neither permission yields none", () => {
    assert.equal(resolveConversationReadScope(ctx({ hasPermission: () => false })).mode, "none");
    assert.throws(
      () => assertCanReadConversations(ctx({ hasPermission: () => false })),
      PermissionDeniedError,
    );
  });

  it("B. View Assigned sees own assigned conversations", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: "agent-a", department_id: SUPPORT }), scope),
      true,
    );
  });

  it("C. View Assigned + department sees own department unassigned queue", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(
        conversation({ assigned_user_id: null, department_id: SALES }),
        scope,
      ),
      true,
    );
  });

  it("D. View Assigned + department does not see another department queue", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(
        conversation({ assigned_user_id: null, department_id: SUPPORT }),
        scope,
      ),
      false,
    );
  });

  it("E. View Assigned without department sees assigned-only", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: null,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: "agent-a", department_id: SALES }), scope),
      true,
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: null, department_id: SALES }), scope),
      false,
    );
  });

  it("F. View Assigned does not see another user's assigned conversation", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(
        conversation({ assigned_user_id: "agent-b", department_id: SALES }),
        scope,
      ),
      false,
    );
  });

  it("G/H. Manager sees managed departments only", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "mgr-1",
        departmentId: null,
        managedDepartmentIds: [SALES, CS],
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: "agent-x", department_id: SALES }), scope),
      true,
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: null, department_id: CS }), scope),
      true,
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: null, department_id: SUPPORT }), scope),
      false,
    );
  });

  it("I. Manager with zero managed departments sees no department-scoped rows", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "mgr-1",
        managedDepartmentIds: [],
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: null, department_id: SALES }), scope),
      false,
    );
  });

  it("J. NULL department + NULL assignee: View Assigned => hidden", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: null, department_id: null }), scope),
      false,
    );
  });

  it("K. NULL department + NULL assignee: Manager => hidden", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "mgr-1",
        managedDepartmentIds: [SALES],
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(conversation({ assigned_user_id: null, department_id: null }), scope),
      false,
    );
  });

  it("O. Assigned user sees conversation even when department differs", () => {
    const scope = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    assert.equal(
      isConversationVisibleToScope(
        conversation({ assigned_user_id: "agent-a", department_id: SUPPORT }),
        scope,
      ),
      true,
    );
  });

  it("P/Q. Reassignment and return to department queue", () => {
    const agentA = resolveConversationReadScope(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    const agentB = resolveConversationReadScope(
      ctx({
        userId: "agent-b",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );
    const mgr = resolveConversationReadScope(
      ctx({
        userId: "mgr-1",
        managedDepartmentIds: [SALES],
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
    );

    const unassigned = conversation({ assigned_user_id: null, department_id: SALES });
    assert.equal(isConversationVisibleToScope(unassigned, agentA), true);
    assert.equal(isConversationVisibleToScope(unassigned, agentB), true);
    assert.equal(isConversationVisibleToScope(unassigned, mgr), true);

    const assignedA = conversation({ assigned_user_id: "agent-a", department_id: SALES });
    assert.equal(isConversationVisibleToScope(assignedA, agentA), true);
    assert.equal(isConversationVisibleToScope(assignedA, agentB), false);
    assert.equal(isConversationVisibleToScope(assignedA, mgr), true);

    const assignedB = conversation({ assigned_user_id: "agent-b", department_id: SALES });
    assert.equal(isConversationVisibleToScope(assignedB, agentA), false);
    assert.equal(isConversationVisibleToScope(assignedB, agentB), true);
    assert.equal(isConversationVisibleToScope(assignedB, mgr), true);

    assert.equal(isConversationVisibleToScope(unassigned, agentA), true);
    assert.equal(isConversationVisibleToScope(unassigned, agentB), true);
  });

  it("applies visibilityConstraint for View Assigned (not assignee-only force)", () => {
    const filtered = applyConversationListVisibilityFilter(
      { companyId: "company-1", channelType: "email" },
      {
        mode: "assigned",
        userId: "agent-a",
        departmentId: SALES,
        managedDepartmentIds: [CS],
      },
    );
    assert.equal(filtered.assignedUserId, undefined);
    assert.deepEqual(filtered.visibilityConstraint, {
      userId: "agent-a",
      departmentId: SALES,
      managedDepartmentIds: [CS],
    });
  });

  it("forces spoofed assignee filter to self under View Assigned", () => {
    const filtered = applyConversationListVisibilityFilter(
      { companyId: "company-1", channelType: "email", assignedUserId: "agent-b" },
      {
        mode: "assigned",
        userId: "agent-a",
        departmentId: null,
        managedDepartmentIds: [],
      },
    );
    assert.equal(filtered.assignedUserId, "agent-a");
  });

  it("customerId filter is preserved and does not drop visibilityConstraint", () => {
    const assigned = applyConversationListVisibilityFilter(
      { companyId: "company-1", channelType: "email", customerId: "cust-1" },
      {
        mode: "assigned",
        userId: "agent-a",
        departmentId: SALES,
        managedDepartmentIds: [CS],
      },
    );
    assert.equal(assigned.customerId, "cust-1");
    assert.equal(assigned.channelType, "email");
    assert.deepEqual(assigned.visibilityConstraint?.userId, "agent-a");

    const all = applyConversationListVisibilityFilter(
      {
        companyId: "company-1",
        channelType: "email",
        customerId: "cust-1",
        visibilityConstraint: {
          userId: "spoof",
          departmentId: null,
          managedDepartmentIds: [],
        },
      },
      { mode: "all" },
    );
    assert.equal(all.customerId, "cust-1");
    assert.equal(all.visibilityConstraint, undefined);
  });
});

describe("ConversationService visibility", () => {
  it("A. View All lists all company email conversations", async () => {
    const rows = [
      conversation({ id: "c1", assigned_user_id: "agent-a" }),
      conversation({ id: "c2", assigned_user_id: "agent-b" }),
      conversation({ id: "c3", assigned_user_id: null }),
    ];
    const service = new ConversationService({
      list: async (filter) => {
        assert.equal(filter.assignedUserId, undefined);
        assert.equal(filter.visibilityConstraint, undefined);
        return rows;
      },
    } as never);

    const result = await service.listConversations(
      ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
      { companyId: "company-1", channelType: "email" },
    );
    assert.equal(result.length, 3);
  });

  it("View Assigned list applies visibilityConstraint", async () => {
    const service = new ConversationService({
      list: async (filter) => {
        assert.equal(filter.assignedUserId, undefined);
        assert.deepEqual(filter.visibilityConstraint, {
          userId: "agent-a",
          departmentId: SALES,
          managedDepartmentIds: [],
        });
        return [
          conversation({ id: "c1", assigned_user_id: "agent-a" }),
          conversation({ id: "c2", assigned_user_id: null, department_id: SALES }),
        ];
      },
    } as never);

    const result = await service.listConversations(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      { companyId: "company-1", channelType: "email" },
    );
    assert.equal(result.length, 2);
  });

  it("customerId list still applies View Assigned visibility and does not widen it", async () => {
    const listed: string[] = [];
    const service = new ConversationService({
      list: async (filter) => {
        listed.push(filter.customerId ?? "");
        assert.deepEqual(filter.visibilityConstraint, {
          userId: "agent-a",
          departmentId: SALES,
          managedDepartmentIds: [],
        });
        return [
          conversation({
            id: "c-visible",
            customer_id: "cust-1",
            assigned_user_id: "agent-a",
          }),
        ];
      },
    } as never);

    const result = await service.listConversations(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      { companyId: "company-1", channelType: "email", customerId: "cust-1" },
    );
    assert.deepEqual(listed, ["cust-1"]);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, "c-visible");
  });

  it("View Assigned cannot open another employee's conversation by id", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ id: "conv-b", assigned_user_id: "agent-b", department_id: SALES }),
    } as never);

    await assert.rejects(
      () =>
        service.getConversation(
          ctx({
            userId: "agent-a",
            departmentId: SALES,
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
          }),
          "conv-b",
        ),
      ConversationNotFoundError,
    );
  });

  it("View Assigned can open own department unassigned by id", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ id: "conv-q", assigned_user_id: null, department_id: SALES }),
    } as never);

    const row = await service.getConversation(
      ctx({
        userId: "agent-a",
        departmentId: SALES,
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      "conv-q",
    );
    assert.equal(row.id, "conv-q");
  });

  it("View Assigned can open own conversation by id", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ id: "conv-a", assigned_user_id: "agent-a" }),
    } as never);

    const row = await service.getConversation(
      ctx({
        userId: "agent-a",
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      "conv-a",
    );
    assert.equal(row.id, "conv-a");
  });

  it("neither permission cannot list", async () => {
    const service = new ConversationService({ list: async () => [] } as never);
    await assert.rejects(
      () =>
        service.listConversations(ctx({ hasPermission: () => false }), {
          companyId: "company-1",
          channelType: "email",
        }),
      PermissionDeniedError,
    );
  });

  it("M. cross-company access remains denied", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ id: "conv-x", company_id: "company-2", assigned_user_id: "agent-a" }),
    } as never);

    await assert.rejects(
      () =>
        service.getConversation(
          ctx({
            companyId: "company-1",
            userId: "agent-a",
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view,
          }),
          "conv-x",
        ),
      PermissionDeniedError,
    );
  });

  it("N. Super Admin remains full access", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ id: "conv-b", assigned_user_id: "agent-b", department_id: SUPPORT }),
    } as never);

    const row = await service.getConversation(
      ctx({ isSuperAdmin: true, hasPermission: () => false }),
      "conv-b",
    );
    assert.equal(row.id, "conv-b");
  });

  it("unassigned NULL ownership denied for View Assigned", () => {
    assert.throws(
      () =>
        assertConversationReadable(
          ctx({
            userId: "agent-a",
            departmentId: SALES,
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
          }),
          conversation({ assigned_user_id: null, department_id: null }),
        ),
      ConversationNotFoundError,
    );
  });

  it("Supervisor View All still reads another agent's conversation", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ id: "conv-b", assigned_user_id: "agent-b" }),
    } as never);

    const row = await service.getConversation(
      ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
      "conv-b",
    );
    assert.equal(row.assigned_user_id, "agent-b");
  });
});

describe("Phase 6D Step 2 RLS migration contract", () => {
  const migrationPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../supabase/migrations/371_conversation_department_visibility_rls.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("defines list_managed_department_ids with manager_user_id + is_active", () => {
    assert.match(sql, /list_managed_department_ids/);
    assert.match(sql, /manager_user_id = auth\.uid\(\)/);
    assert.match(sql, /d\.is_active = true/);
  });

  it("conversations_select uses conversation_visible_to_caller", () => {
    assert.match(sql, /create policy conversations_select on public\.conversations/);
    assert.match(sql, /conversation_visible_to_caller\(company_id, assigned_user_id, department_id\)/);
  });

  it("child SELECT policies inherit conversation_visible_to_caller", () => {
    assert.match(sql, /create policy conversation_messages_select/);
    assert.match(sql, /create policy conversation_participants_select/);
    assert.match(sql, /conversation_visible_to_caller\(c\.company_id, c\.assigned_user_id, c\.department_id\)/);
  });

  it("does not modify assignment audit / permission grants", () => {
    assert.doesNotMatch(sql, /create table[\s\S]*assignment_audit_events/i);
    assert.doesNotMatch(sql, /alter table\s+public\.assignment_audit_events/i);
    assert.doesNotMatch(sql, /insert into public\.permissions/i);
    assert.doesNotMatch(sql, /insert into public\.role_permissions/i);
  });
});
