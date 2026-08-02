import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationMessageRecord } from "../types.js";
import {
  chronologicalFromLatestWindow,
  compareMessagesChronologically,
  newestMessageInList,
} from "./message-list-window.js";

const CONVERSATION_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

function buildMessage(sequence: number, overrides: Partial<ConversationMessageRecord> = {}): ConversationMessageRecord {
  const day = new Date(Date.UTC(2026, 6, 1));
  day.setUTCSeconds(day.getUTCSeconds() + sequence);
  return {
    id: `msg-${sequence}`,
    conversation_id: CONVERSATION_ID,
    participant_id: null,
    sequence_number: sequence,
    message_type: sequence % 2 === 0 ? "incoming" : "outgoing",
    content_type: "text",
    content: `message-${sequence}`,
    metadata: {},
    status: "delivered",
    external_message_id: null,
    attachment_type: null,
    attachment_url: null,
    mime_type: null,
    file_size: null,
    search_text: `message-${sequence}`,
    created_at: day.toISOString(),
    created_by: null,
    ...overrides,
  };
}

function buildConversationMessages(count: number): ConversationMessageRecord[] {
  return Array.from({ length: count }, (_, index) => buildMessage(index + 1));
}

function simulateLatestWindowQuery(
  allMessages: ConversationMessageRecord[],
  limit: number,
): ConversationMessageRecord[] {
  return [...allMessages]
    .sort((a, b) => compareMessagesChronologically(b, a))
    .slice(0, limit);
}

describe("message list window (CNV-000010 regression)", () => {
  const allMessages = buildConversationMessages(582);
  const newestDbMessage = allMessages[allMessages.length - 1]!;

  it("builds 582 messages for the regression scenario", () => {
    assert.equal(allMessages.length, 582);
    assert.equal(newestDbMessage.sequence_number, 582);
    assert.equal(newestDbMessage.id, "msg-582");
  });

  it("includes the newest message in the latest 200 window", () => {
    const newestFirst = simulateLatestWindowQuery(allMessages, 200);
    const chronological = chronologicalFromLatestWindow(newestFirst);

    assert.equal(chronological.length, 200);
    assert.equal(chronological[0]?.sequence_number, 383);
    assert.equal(chronological[199]?.sequence_number, 582);
    assert.equal(chronological.some((message) => message.id === newestDbMessage.id), true);
    assert.equal(newestMessageInList(chronological)?.id, newestDbMessage.id);
  });

  it("returns transcript rows oldest to newest with stable sequence ordering", () => {
    const chronological = chronologicalFromLatestWindow(simulateLatestWindowQuery(allMessages, 200));

    for (let index = 1; index < chronological.length; index += 1) {
      const previous = chronological[index - 1]!;
      const current = chronological[index]!;
      assert.ok(
        compareMessagesChronologically(previous, current) < 0,
        `expected ${previous.id} before ${current.id}`,
      );
    }
  });

  it("preserves sequence ordering when created_at ties occur", () => {
    const tiedCreatedAt = "2026-08-02T00:59:32.077Z";
    const newestFirst = [
      buildMessage(582, { id: "newest", created_at: tiedCreatedAt }),
      buildMessage(581, { id: "middle", created_at: tiedCreatedAt }),
      buildMessage(580, { id: "oldest", created_at: tiedCreatedAt }),
    ];
    const chronological = chronologicalFromLatestWindow(newestFirst);

    assert.deepEqual(
      chronological.map((message) => message.id),
      ["oldest", "middle", "newest"],
    );
  });
});

describe("compareMessagesChronologically", () => {
  it("orders by sequence_number then created_at", () => {
    const older = buildMessage(1, { created_at: "2026-08-01T00:00:00.000Z" });
    const newer = buildMessage(2, { created_at: "2026-08-02T00:00:00.000Z" });
    assert.ok(compareMessagesChronologically(older, newer) < 0);
    assert.ok(compareMessagesChronologically(newer, older) > 0);
  });
});
