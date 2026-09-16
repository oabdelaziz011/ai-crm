import assert from "node:assert/strict";
import { describe, it, beforeEach, after } from "node:test";
import {
  emailIncomingSoundAdapters,
  getEmailIncomingAlertDebugState,
  hasSeenEmailInboundMessageId,
  isEmailInboundAlertBaselineReady,
  markEmailInboundAlertBaselineReady,
  notifyEmailIncomingMessageAlert,
  rememberEmailInboundMessageIds,
  resetEmailIncomingAlertsForTests,
} from "./email-incoming-alerts.ts";
import { sortEmailWorkspaceConversations } from "./email-workspace-list-item.ts";
import type { ConversationRecord } from "@workspace/ai-conversation";

const plays: number[] = [];
const originalAdapters = {
  isEnabled: emailIncomingSoundAdapters.isEnabled,
  play: emailIncomingSoundAdapters.play,
};

beforeEach(() => {
  resetEmailIncomingAlertsForTests();
  plays.length = 0;
  emailIncomingSoundAdapters.isEnabled = () => true;
  emailIncomingSoundAdapters.play = () => {
    plays.push(1);
  };
});

after(() => {
  emailIncomingSoundAdapters.isEnabled = originalAdapters.isEnabled;
  emailIncomingSoundAdapters.play = originalAdapters.play;
});

describe("email inbound alerts baseline/dedup", () => {
  it("A/M: initial load / pre-baseline does not play sound for historical ids", () => {
    rememberEmailInboundMessageIds(["hist-1", "hist-2"]);
    assert.equal(isEmailInboundAlertBaselineReady(), false);
    assert.equal(
      notifyEmailIncomingMessageAlert({
        messageId: "hist-3",
        conversationId: "c1",
      }),
      "baseline_recorded",
    );
    assert.equal(plays.length, 0);
    assert.equal(hasSeenEmailInboundMessageId("hist-3"), true);
  });

  it("N/L: after baseline, new message plays once when sound enabled", () => {
    markEmailInboundAlertBaselineReady();
    assert.equal(
      notifyEmailIncomingMessageAlert({ messageId: "m1", conversationId: "c1" }),
      "played",
    );
    assert.equal(plays.length, 1);
    assert.equal(getEmailIncomingAlertDebugState().playCount, 1);
  });

  it("F/G/H/I/J: duplicate/refetch/remount/reconnect of same message id never replays", () => {
    markEmailInboundAlertBaselineReady();
    assert.equal(
      notifyEmailIncomingMessageAlert({ messageId: "m-dup", conversationId: "c1" }),
      "played",
    );
    assert.equal(
      notifyEmailIncomingMessageAlert({ messageId: "m-dup", conversationId: "c1" }),
      "ignored_duplicate",
    );
    assert.equal(
      notifyEmailIncomingMessageAlert({ messageId: "m-dup", conversationId: "c1" }),
      "ignored_duplicate",
    );
    assert.equal(plays.length, 1);
  });

  it("K: notification sound OFF skips playback but still consumes id", () => {
    emailIncomingSoundAdapters.isEnabled = () => false;
    markEmailInboundAlertBaselineReady();
    assert.equal(
      notifyEmailIncomingMessageAlert({ messageId: "m-mute", conversationId: "c1" }),
      "skipped_muted",
    );
    assert.equal(plays.length, 0);
    assert.equal(
      notifyEmailIncomingMessageAlert({ messageId: "m-mute", conversationId: "c1" }),
      "ignored_duplicate",
    );
  });

  it("skips sound when the focused conversation matches (still consumes id)", () => {
    markEmailInboundAlertBaselineReady();
    assert.equal(
      notifyEmailIncomingMessageAlert({
        messageId: "m-focus",
        conversationId: "c-open",
        focusedConversationId: "c-open",
      }),
      "skipped_focused",
    );
    assert.equal(plays.length, 0);
  });
});

function emailRow(id: string, lastMessageAt: string, unread = 0): ConversationRecord {
  return {
    id,
    company_id: "co-1",
    conversation_number: id,
    company_channel_id: "ch-1",
    ai_assistant_id: "asst-1",
    channel_type: "email",
    channel_instance_id: null,
    state: "idle",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: unread,
    unread_count_customer: 0,
    last_message_at: lastMessageAt,
    last_message_preview: "hello",
    last_message_direction: "incoming",
    created_at: lastMessageAt,
    updated_at: lastMessageAt,
    deleted_at: null,
  } as ConversationRecord;
}

describe("email inbound list ordering with unread/open (regression)", () => {
  it("E: new inbound D appears first; opening B does not reorder", () => {
    const c = emailRow("C", "2026-09-13T10:00:00.000Z");
    const b = emailRow("B", "2026-09-13T09:00:00.000Z", 1);
    const a = emailRow("A", "2026-09-13T08:00:00.000Z");
    const before = sortEmailWorkspaceConversations([c, b, a]).map((row) => row.id);
    assert.deepEqual(before, ["C", "B", "A"]);

    const d = emailRow("D", "2026-09-13T11:00:00.000Z", 1);
    const withNew = sortEmailWorkspaceConversations([d, c, b, a]).map((row) => row.id);
    assert.deepEqual(withNew, ["D", "C", "B", "A"]);

    const openedB = {
      ...b,
      unread_count_employee: 0,
      updated_at: "2026-09-13T12:00:00.000Z",
    };
    const afterOpen = sortEmailWorkspaceConversations([d, c, openedB, a]).map((row) => row.id);
    assert.deepEqual(afterOpen, ["D", "C", "B", "A"]);
    assert.equal(openedB.unread_count_employee, 0);
  });
});
