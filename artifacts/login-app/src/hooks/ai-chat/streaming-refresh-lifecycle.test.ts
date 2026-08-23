import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendPendingAssistantIfNeeded,
  buildDisplayMessages,
  hasPersistedOutgoingForPending,
  shouldClearStreamingBeforeRefresh,
  shouldShowSyntheticWelcome,
  TURN_ASSISTANT_PENDING_ID,
} from "./streaming-refresh-lifecycle.ts";

describe("shouldClearStreamingBeforeRefresh", () => {
  it("requires renderable assistant before clearing streamed content", () => {
    assert.equal(
      shouldClearStreamingBeforeRefresh({
        isSending: true,
        hasStreamingContent: true,
        hasRenderableAssistantResponse: true,
      }),
      true,
    );
    assert.equal(
      shouldClearStreamingBeforeRefresh({
        isSending: true,
        hasStreamingContent: true,
        hasRenderableAssistantResponse: false,
      }),
      false,
    );
  });

  it("does not clear when not sending or stream empty", () => {
    assert.equal(
      shouldClearStreamingBeforeRefresh({
        isSending: false,
        hasStreamingContent: true,
        hasRenderableAssistantResponse: true,
      }),
      false,
    );
    assert.equal(
      shouldClearStreamingBeforeRefresh({
        isSending: true,
        hasStreamingContent: false,
        hasRenderableAssistantResponse: true,
      }),
      false,
    );
  });
});

describe("shouldShowSyntheticWelcome", () => {
  it("shows welcome only on empty conversation before first user send", () => {
    assert.equal(
      shouldShowSyntheticWelcome({
        loaded: [],
        welcomeMessage: "Hello",
        suppressSyntheticWelcome: false,
      }),
      true,
    );
    assert.equal(
      shouldShowSyntheticWelcome({
        loaded: [],
        welcomeMessage: "Hello",
        suppressSyntheticWelcome: true,
      }),
      false,
    );
    assert.equal(
      shouldShowSyntheticWelcome({
        loaded: [{ id: "1", role: "user", content: "hi", createdAt: "t" }],
        welcomeMessage: "Hello",
        suppressSyntheticWelcome: false,
      }),
      false,
    );
  });
});

describe("appendPendingAssistantIfNeeded", () => {
  it("appends pending assistant until persisted outgoing matches", () => {
    const withPending = appendPendingAssistantIfNeeded(
      [{ id: "u1", role: "user", content: "هاي", createdAt: "t1" }],
      "مرحبًا",
    );
    assert.equal(withPending.length, 2);
    assert.equal(withPending[1]?.id, TURN_ASSISTANT_PENDING_ID);

    const persisted = appendPendingAssistantIfNeeded(
      [
        { id: "u1", role: "user", content: "هاي", createdAt: "t1" },
        { id: "a1", role: "assistant", content: "مرحبًا", createdAt: "t2" },
      ],
      "مرحبًا",
    );
    assert.equal(persisted.length, 2);
    assert.ok(!persisted.some((message) => message.id === TURN_ASSISTANT_PENDING_ID));
  });

  it("detects persisted outgoing for pending content", () => {
    assert.equal(
      hasPersistedOutgoingForPending(
        [{ id: "a1", role: "assistant", content: "reply", createdAt: "t" }],
        "reply",
      ),
      true,
    );
    assert.equal(
      hasPersistedOutgoingForPending(
        [{ id: "u1", role: "user", content: "hi", createdAt: "t" }],
        "reply",
      ),
      false,
    );
  });
});

describe("buildDisplayMessages", () => {
  it("hides synthetic welcome after first user send suppression", () => {
    const messages = buildDisplayMessages({
      loaded: [],
      welcomeMessage: "Welcome",
      suppressSyntheticWelcome: true,
      pendingAssistantContent: "Reply",
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.id, TURN_ASSISTANT_PENDING_ID);
  });
});
