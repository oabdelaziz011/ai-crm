/**
 * Email Workspace conversation assignment — persist, permission, labels, cache.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  CONVERSATION_PERMISSIONS,
  PermissionDeniedError,
  type ConversationRecord,
  type ServiceContext,
} from "@workspace/ai-conversation";
import type { EmployeeIdentity } from "@/lib/employee-identity/types";
import {
  EMAIL_CONVERSATION_ASSIGN_PERMISSION,
  EMAIL_CONVERSATION_UNASSIGNED_VALUE,
  assignedUserIdFromEmailConversationSelectValue,
  buildEmailConversationAssigneeSelectOptions,
  canAssignEmailConversation,
  emailConversationAssigneeLabel,
  findEmailConversationAssignee,
  listAssignableEmailEmployees,
  patchConversationAssigneeCacheData,
  patchConversationAssigneeInList,
  persistEmailConversationAssignee,
  resolveEmailConversationAssigneeUserId,
  selectValueForEmailConversationAssignee,
} from "./email-conversation-assignment.ts";

const here = dirname(fileURLToPath(import.meta.url));
const panelSrc = readFileSync(join(here, "../../components/email/email-workspace-panel.tsx"), "utf8");
const controlSrc = readFileSync(
  join(here, "../../components/email/email-conversation-assignee-control.tsx"),
  "utf8",
);
const helperSrc = readFileSync(join(here, "email-conversation-assignment.ts"), "utf8");
const composerSrc = readFileSync(join(here, "../../components/email/email-composer-body-editor.tsx"), "utf8");
const signatureSrc = readFileSync(join(here, "email-signature-text.ts"), "utf8");
const enLocale = JSON.parse(readFileSync(join(here, "../../locales/en/common.json"), "utf8")) as {
  emailModule: { workspace: Record<string, string> };
};
const arLocale = JSON.parse(readFileSync(join(here, "../../locales/ar/common.json"), "utf8")) as {
  emailModule: { workspace: Record<string, string> };
};

function employee(overrides: Partial<EmployeeIdentity> = {}): EmployeeIdentity {
  return {
    id: "profile-sara",
    userId: "user-sara",
    fullName: "Sara Ahmed",
    email: "sara@co.test",
    avatarUrl: null,
    phone: null,
    jobTitle: "Agent",
    department: null,
    status: "active",
    language: null,
    timezone: null,
    bio: null,
    extensionNumber: null,
    presence: null,
    lastSeenAt: null,
    ...overrides,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "conv-1",
    company_id: "co-1",
    conversation_number: "CNV-1",
    company_channel_id: "ch-1",
    ai_assistant_id: "a-1",
    channel_type: "email",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: null,
    metadata: { composer: { subject: "Keep me" } },
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: "2026-09-14T10:00:00.000Z",
    last_message_preview: "Hello",
    last_participant_type: "customer",
    search_text: "",
    started_at: "2026-09-14T10:00:00.000Z",
    ended_at: null,
    created_at: "2026-09-14T10:00:00.000Z",
    updated_at: "2026-09-14T10:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function ctx(partial: Partial<ServiceContext> = {}): ServiceContext {
  return {
    userId: "user-sara",
    companyId: "co-1",
    isSuperAdmin: false,
    hasPermission: () => false,
    ...partial,
  };
}

describe("email conversation assignment helpers", () => {
  it("uses ai.conversations.takeover as the canonical assignment permission", () => {
    assert.equal(EMAIL_CONVERSATION_ASSIGN_PERMISSION, "ai.conversations.takeover");
    assert.equal(EMAIL_CONVERSATION_ASSIGN_PERMISSION, CONVERSATION_PERMISSIONS.takeover);
    assert.equal(canAssignEmailConversation({ hasPermission: (p) => p === "ai.conversations.takeover" }), true);
    assert.equal(canAssignEmailConversation({ hasPermission: (p) => p === "conversation.assign" }), true);
    assert.equal(canAssignEmailConversation({ isSuperAdmin: true, hasPermission: () => false }), true);
    assert.equal(canAssignEmailConversation({ hasPermission: (p) => p === "tickets.assign" }), false);
    assert.equal(canAssignEmailConversation({ hasPermission: (p) => p === "ai.conversations.view" }), false);
    assert.equal(canAssignEmailConversation({ hasPermission: (p) => p === "ai.conversations.view_assigned" }), false);
  });

  it("renders the current employee name", () => {
    const row = employee();
    assert.equal(findEmailConversationAssignee([row], "user-sara")?.fullName, "Sara Ahmed");
    assert.equal(emailConversationAssigneeLabel("user-sara", "Sara Ahmed", "Unassigned"), "Sara Ahmed");
  });

  it("renders Unassigned when assigned_user_id is null", () => {
    assert.equal(findEmailConversationAssignee([employee()], null), null);
    assert.equal(emailConversationAssigneeLabel(null, "Sara Ahmed", "Unassigned"), "Unassigned");
    assert.equal(selectValueForEmailConversationAssignee(null), EMAIL_CONVERSATION_UNASSIGNED_VALUE);
  });

  it("builds a searchable selector with Unassigned plus employees (auth user ids)", () => {
    const options = buildEmailConversationAssigneeSelectOptions({
      employees: [
        employee(),
        employee({
          id: "profile-inactive",
          userId: "user-inactive",
          fullName: "Old",
          status: "inactive",
        }),
        employee({ id: "profile-no-auth", userId: null, fullName: "Broken" }),
      ],
      assignedUserId: null,
      unassignedLabel: "Unassigned",
    });
    assert.equal(options[0]?.value, EMAIL_CONVERSATION_UNASSIGNED_VALUE);
    assert.equal(options[0]?.label, "Unassigned");
    assert.equal(options.some((row) => row.value === "user-sara" && row.label === "Sara Ahmed"), true);
    assert.equal(options.some((row) => row.value === "profile-sara"), false);
    assert.equal(options.some((row) => row.value === "user-inactive"), false);
    assert.equal(options.some((row) => row.label === "Broken"), false);
  });

  it("selecting an employee calls assignConversation with current state (not ticket assign)", async () => {
    const calls: unknown[] = [];
    const saved = conversation({ assigned_user_id: "user-sara" });
    const result = await persistEmailConversationAssignee({
      services: {
        assignConversation: async (_ctx, input) => {
          calls.push({ kind: "assign", input });
          return saved;
        },
        releaseConversation: async () => {
          calls.push({ kind: "release" });
          return conversation();
        },
      },
      context: ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.takeover }),
      conversation: conversation({ state: "waiting_user" }),
      assignedUserId: "user-sara",
    });
    assert.deepEqual(calls, [
      {
        kind: "assign",
        input: {
          conversationId: "conv-1",
          assignedUserId: "user-sara",
          state: "waiting_user",
        },
      },
    ]);
    assert.equal(result.assigned_user_id, "user-sara");
    assert.doesNotMatch(helperSrc, /from\(["']support_tickets["']\)|assignTicket/);
  });

  it("selecting Unassigned calls releaseConversation with null assignee semantics and current state", async () => {
    const calls: unknown[] = [];
    await persistEmailConversationAssignee({
      services: {
        assignConversation: async () => {
          calls.push({ kind: "assign" });
          return conversation();
        },
        releaseConversation: async (_ctx, input) => {
          calls.push({ kind: "release", input });
          return conversation({ assigned_user_id: null });
        },
      },
      context: ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.release }),
      conversation: conversation({ assigned_user_id: "user-sara", state: "waiting_user" }),
      assignedUserId: null,
    });
    assert.deepEqual(calls, [
      {
        kind: "release",
        input: { conversationId: "conv-1", state: "waiting_user" },
      },
    ]);
    assert.equal(assignedUserIdFromEmailConversationSelectValue(EMAIL_CONVERSATION_UNASSIGNED_VALUE), null);
  });

  it("save failure preserves the previous assignee in the list cache", () => {
    const previous = conversation({ assigned_user_id: "user-sara", last_message_at: "2026-09-14T12:00:00.000Z" });
    const other = conversation({ id: "conv-2", assigned_user_id: "user-other", last_message_at: "2026-09-14T13:00:00.000Z" });
    const optimistic = patchConversationAssigneeInList([previous, other], "conv-1", "user-next");
    assert.equal(optimistic[0]?.assigned_user_id, "user-next");
    assert.equal(optimistic[1]?.id, "conv-2");
    const reverted = patchConversationAssigneeInList(optimistic, "conv-1", previous.assigned_user_id);
    assert.equal(reverted[0]?.assigned_user_id, "user-sara");
    assert.equal(reverted[0]?.last_message_at, previous.last_message_at);
    assert.equal(reverted[1]?.id, "conv-2");
    assert.deepEqual(
      reverted.map((row) => row.id),
      ["conv-1", "conv-2"],
    );
  });

  it("does not reorder inbox rows when patching assignee", () => {
    const rows = [
      conversation({ id: "a", last_message_at: "2026-09-14T09:00:00.000Z" }),
      conversation({ id: "b", last_message_at: "2026-09-14T10:00:00.000Z" }),
      conversation({ id: "c", last_message_at: "2026-09-14T11:00:00.000Z" }),
    ];
    const patched = patchConversationAssigneeInList(rows, "b", "user-sara");
    assert.deepEqual(
      patched.map((row) => row.id),
      ["a", "b", "c"],
    );
    const infinite = patchConversationAssigneeCacheData(
      { pages: [{ rows }], pageParams: [0] },
      "b",
      "user-sara",
    ) as { pages: Array<{ rows: ConversationRecord[] }>; pageParams: number[] };
    assert.deepEqual(
      infinite.pages[0]?.rows.map((row) => row.id),
      ["a", "b", "c"],
    );
    assert.equal(infinite.pages[0]?.rows[1]?.assigned_user_id, "user-sara");
    assert.deepEqual(infinite.pageParams, [0]);
  });
});

describe("email conversation assignment UI contracts", () => {
  it("authorized users get a selector; unauthorized users cannot assign", () => {
    assert.match(controlSrc, /canAssign \? \(/);
    assert.match(controlSrc, /data-testid="email-workspace-assignee-selector"/);
    assert.match(controlSrc, /SearchableSelect/);
    assert.match(controlSrc, /if \(!canAssign\) return;/);
    assert.match(controlSrc, /data-testid="email-workspace-assignee-value"/);
    assert.match(controlSrc, /useAssignableEmployees/);
    assert.match(controlSrc, /assigneeNoEligible/);
    assert.doesNotMatch(controlSrc, /EmployeeIdentityService/);
    assert.match(panelSrc, /canAssign=\{canAssignSelectedEmailConversation\}/);
    assert.match(panelSrc, /canAssignEmailConversation/);
    assert.match(helperSrc, /ai\.conversations\.takeover/);
  });

  it("wires Assigned To list filter through ConversationService assignedUserId", () => {
    assert.match(panelSrc, /useConversationList\(listFilters, 100\)/);
    assert.match(panelSrc, /assignedUserId: assigneeFilterToListAssignedUserId\(assigneeFilter\)/);
    assert.match(panelSrc, /EmployeeIdentityService\.listByCompany/);
    assert.match(panelSrc, /data-testid="email-workspace-assignee-filter"/);
    assert.doesNotMatch(panelSrc, /useAssignableEmployees\(\{[\s\S]{0,80}filter/);
  });

  it("assigned-only visibility stays on ConversationService / backend", () => {
    assert.match(helperSrc, /assignConversation/);
    assert.match(helperSrc, /releaseConversation/);
    assert.match(helperSrc, /getConversation|state is always passed|Current conversation state/i);
    assert.doesNotMatch(helperSrc, /view_assigned/);
    assert.match(controlSrc, /persistEmailConversationAssignee/);
    assert.match(controlSrc, /services\.conversations/);
  });

  it("assignment does not change composer or signature behavior", () => {
    assert.doesNotMatch(helperSrc, /composer|signature|logo|acknowledgement|ai-draft|smtp|imap/i);
    assert.doesNotMatch(controlSrc, /EmailComposerBodyEditor|email-signature-text|EmailAiWritePanel/);
    assert.match(panelSrc, /EmailComposerBodyEditor/);
    assert.match(panelSrc, /email-signature-text/);
    assert.match(composerSrc, /min-h-\[11rem\]/);
    assert.match(signatureSrc, /renderCompanySignatureHtml/);
  });
});

describe("email conversation assignment localization", () => {
  const keys = [
    "assigneeLabel",
    "assigneeUnassigned",
    "assigneeSearch",
    "assigneeEmpty",
    "assigneeNoEligible",
    "assigneeSaving",
    "assigneeSaved",
    "assigneeSaveFailed",
    "assigneeUnauthorized",
    "assigneeUnavailable",
  ] as const;

  it("has English strings for all assignee UI copy", () => {
    for (const key of keys) {
      const value = enLocale.emailModule.workspace[key];
      assert.equal(typeof value, "string", key);
      assert.ok(value.trim().length > 0, key);
      assert.doesNotMatch(value, /emailModule\./);
    }
    assert.equal(enLocale.emailModule.workspace.assigneeLabel, "Assignee");
    assert.equal(enLocale.emailModule.workspace.assigneeUnassigned, "Unassigned");
  });

  it("has Arabic strings for all assignee UI copy", () => {
    for (const key of keys) {
      const value = arLocale.emailModule.workspace[key];
      assert.equal(typeof value, "string", key);
      assert.ok(value.trim().length > 0, key);
      assert.doesNotMatch(value, /emailModule\./);
    }
    assert.equal(arLocale.emailModule.workspace.assigneeLabel, "المسؤول");
    assert.equal(arLocale.emailModule.workspace.assigneeUnassigned, "غير معيّن");
  });

  it("keeps RTL-safe layout classes", () => {
    assert.match(controlSrc, /className=\{cn\("flex min-w-0 max-w-full items-center gap-2"/);
    assert.doesNotMatch(controlSrc, /\bml-|\bmr-|\bpl-|\bpr-/);
    assert.match(controlSrc, /SearchableSelect/);
  });
});

describe("email conversation assignment employee ids", () => {
  it("writes auth user ids, not profile ids", () => {
    assert.equal(resolveEmailConversationAssigneeUserId(employee()), "user-sara");
    assert.equal(resolveEmailConversationAssigneeUserId(employee({ userId: null })), null);
    const listed = listAssignableEmailEmployees(
      [employee({ id: "profile-x", userId: "auth-x" })],
      null,
    );
    assert.equal(listed[0]?.userId, "auth-x");
  });
});
