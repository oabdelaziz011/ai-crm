/**
 * ParticipantService list visibility must follow conversation View All / View Assigned.
 * These tests query participants by the inaccessible conversation ID — they do
 * not treat a hidden conversation as sufficient proof.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_PERMISSIONS } from "../constants.js";
import { ConversationNotFoundError, PermissionDeniedError } from "../errors.js";
import { ParticipantService } from "./participant-service.js";
import type {
  ConversationParticipantRecord,
  ConversationRecord,
  ServiceContext,
} from "../types.js";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "user-a",
    companyId: partial.companyId ?? "company-a",
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
    departmentId: partial.departmentId,
    managedDepartmentIds: partial.managedDepartmentIds,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "conv-a",
    company_id: "company-a",
    conversation_number: "1",
    company_channel_id: null,
    ai_assistant_id: "asst-a",
    channel_type: "email",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: null,
    department_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
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
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function participant(conversationId: string, id = "part-1"): ConversationParticipantRecord {
  return {
    id,
    conversation_id: conversationId,
    participant_type: "customer",
    display_name: "Customer",
    profile_ref: null,
    external_participant_id: null,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  };
}

function participantRepo(rowsByConversation: Record<string, ConversationParticipantRecord[]>) {
  return {
    listByConversation: async (conversationId: string) => rowsByConversation[conversationId] ?? [],
    add: async () => participant("conv-a"),
    findById: async () => null,
    remove: async () => participant("conv-a"),
  } as never;
}

function conversationRepo(row: ConversationRecord | null) {
  return {
    findById: async () => row,
  } as never;
}

describe("ParticipantService listParticipants visibility", () => {
  it("View All can read participants for own assigned conversation", async () => {
    const conv = conversation({ id: "conv-mine", assigned_user_id: "user-a" });
    const service = new ParticipantService(
      participantRepo({ "conv-mine": [participant("conv-mine")] }),
      conversationRepo(conv),
    );
    const rows = await service.listParticipants(
      ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
      "conv-mine",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.conversation_id, "conv-mine");
  });

  it("View All can read participants for another employee's conversation", async () => {
    const conv = conversation({ id: "conv-other", assigned_user_id: "user-b" });
    const service = new ParticipantService(
      participantRepo({ "conv-other": [participant("conv-other", "part-other")] }),
      conversationRepo(conv),
    );
    const rows = await service.listParticipants(
      ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
      "conv-other",
    );
    assert.equal(rows[0]?.id, "part-other");
  });

  it("View All can read participants for an unassigned conversation", async () => {
    const conv = conversation({ id: "conv-open", assigned_user_id: null });
    const service = new ParticipantService(
      participantRepo({ "conv-open": [participant("conv-open", "part-open")] }),
      conversationRepo(conv),
    );
    const rows = await service.listParticipants(
      ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
      "conv-open",
    );
    assert.equal(rows[0]?.id, "part-open");
  });

  it("View Assigned can read participants for conversation assigned to self", async () => {
    const conv = conversation({ id: "conv-mine", assigned_user_id: "user-a" });
    const service = new ParticipantService(
      participantRepo({ "conv-mine": [participant("conv-mine")] }),
      conversationRepo(conv),
    );
    const rows = await service.listParticipants(
      ctx({
        userId: "user-a",
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      "conv-mine",
    );
    assert.equal(rows.length, 1);
  });

  it("View Assigned cannot read participants for another employee's conversation ID", async () => {
    const conv = conversation({ id: "conv-other", assigned_user_id: "user-b" });
    let listed = false;
    const service = new ParticipantService(
      {
        listByConversation: async () => {
          listed = true;
          return [participant("conv-other", "part-other")];
        },
        add: async () => participant("conv-other"),
        findById: async () => null,
        remove: async () => participant("conv-other"),
      } as never,
      conversationRepo(conv),
    );

    await assert.rejects(
      () =>
        service.listParticipants(
          ctx({
            userId: "user-a",
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
          }),
          "conv-other",
        ),
      (err: unknown) => err instanceof ConversationNotFoundError,
    );
    assert.equal(listed, false);
  });

  it("View Assigned cannot read participants for an unassigned conversation ID", async () => {
    const conv = conversation({ id: "conv-open", assigned_user_id: null });
    let listed = false;
    const service = new ParticipantService(
      {
        listByConversation: async () => {
          listed = true;
          return [participant("conv-open", "part-open")];
        },
        add: async () => participant("conv-open"),
        findById: async () => null,
        remove: async () => participant("conv-open"),
      } as never,
      conversationRepo(conv),
    );

    await assert.rejects(
      () =>
        service.listParticipants(
          ctx({
            userId: "user-a",
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
          }),
          "conv-open",
        ),
      (err: unknown) => err instanceof ConversationNotFoundError,
    );
    assert.equal(listed, false);
  });

  it("View Assigned can read participants for own-department unassigned queue", async () => {
    const conv = conversation({
      id: "conv-queue",
      assigned_user_id: null,
      department_id: "dept-sales",
    });
    const service = new ParticipantService(
      participantRepo({ "conv-queue": [participant("conv-queue", "part-q")] }),
      conversationRepo(conv),
    );

    const rows = await service.listParticipants(
      ctx({
        userId: "user-a",
        departmentId: "dept-sales",
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      "conv-queue",
    );
    assert.equal(rows.length, 1);
  });

  it("View Assigned cannot read participants for another department unassigned queue", async () => {
    const conv = conversation({
      id: "conv-other-dept",
      assigned_user_id: null,
      department_id: "dept-support",
    });
    let listed = false;
    const service = new ParticipantService(
      {
        listByConversation: async () => {
          listed = true;
          return [participant("conv-other-dept")];
        },
        add: async () => participant("conv-other-dept"),
        findById: async () => null,
        remove: async () => participant("conv-other-dept"),
      } as never,
      conversationRepo(conv),
    );

    await assert.rejects(
      () =>
        service.listParticipants(
          ctx({
            userId: "user-a",
            departmentId: "dept-sales",
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
          }),
          "conv-other-dept",
        ),
      (err: unknown) => err instanceof ConversationNotFoundError,
    );
    assert.equal(listed, false);
  });

  it("neither permission cannot read participants for a requested conversation ID", async () => {
    await assert.rejects(
      () =>
        new ParticipantService(
          participantRepo({ "conv-a": [participant("conv-a")] }),
          conversationRepo(conversation()),
        ).listParticipants(ctx({ hasPermission: () => false }), "conv-a"),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("cross-company participant list is denied even when conversation ID is requested", async () => {
    const conv = conversation({
      id: "conv-foreign",
      company_id: "company-b",
      assigned_user_id: "user-a",
    });
    let listed = false;
    const service = new ParticipantService(
      {
        listByConversation: async () => {
          listed = true;
          return [participant("conv-foreign", "part-foreign")];
        },
        add: async () => participant("conv-foreign"),
        findById: async () => null,
        remove: async () => participant("conv-foreign"),
      } as never,
      conversationRepo(conv),
    );

    await assert.rejects(
      () =>
        service.listParticipants(
          ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
          "conv-foreign",
        ),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
    assert.equal(listed, false);
  });
});

describe("migration 358 participant SELECT policy (historical)", () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../supabase/migrations/358_conversation_participants_view_assigned_select.sql"),
    "utf8",
  );

  it("recreates only conversation_participants_select using parent conversation visibility", () => {
    const policyBody = sql.slice(sql.indexOf("create policy conversation_participants_select"));
    assert.match(sql, /drop policy if exists conversation_participants_select/);
    assert.match(sql, /create policy conversation_participants_select/);
    assert.match(policyBody, /from public\.conversations c/);
    assert.match(policyBody, /ai\.conversations\.view_assigned/);
    assert.match(policyBody, /c\.assigned_user_id = auth\.uid\(\)/);
    assert.doesNotMatch(policyBody, /conversation_belongs_to_current_company/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_participants_insert/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_participants_update/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_participants_delete/);
    assert.doesNotMatch(sql, /drop policy if exists conversations_select/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_messages_select/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_attachments_select/);
  });
});

describe("migration 371 participant SELECT inherits Phase 6D visibility", () => {
  const sql = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../supabase/migrations/371_conversation_department_visibility_rls.sql",
    ),
    "utf8",
  );

  it("participants SELECT uses conversation_visible_to_caller only", () => {
    assert.match(sql, /create policy conversation_participants_select/);
    assert.match(sql, /conversation_visible_to_caller\(c\.company_id, c\.assigned_user_id, c\.department_id\)/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_participants_insert/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_participants_update/);
    assert.doesNotMatch(sql, /drop policy if exists conversation_participants_delete/);
  });
});
