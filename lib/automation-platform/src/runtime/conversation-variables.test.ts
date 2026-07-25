import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildResumeInput } from "../orchestrator/session-policy.js";
import {
  extractInteractiveSelection,
  INTERACTIVE_SELECTION_INPUT_KEY,
  mergeConversationVariables,
  normalizeInteractionType,
  readConversationVariables,
} from "./conversation-variables.js";

describe("conversation runtime variables", () => {
  it("merges nested conversation fields without dropping existing keys", () => {
    const merged = mergeConversationVariables(
      { conversation: { channel: "WhatsApp", last_message: "Hi" } },
      { last_button_id: "booking", last_button_title: "Book now", last_selection_type: "button" },
    );

    assert.deepEqual(readConversationVariables(merged), {
      channel: "WhatsApp",
      last_message: "Hi",
      last_button_id: "booking",
      last_button_title: "Book now",
      last_selection_type: "button",
    });
  });

  it("extracts button id and title from interactive resume input", () => {
    assert.deepEqual(
      extractInteractiveSelection(
        {
          replyId: "booking",
          title: "Book now",
          [INTERACTIVE_SELECTION_INPUT_KEY]: "Book now",
        },
        { fallbackHint: "send_buttons" },
      ),
      {
        last_button_id: "booking",
        last_button_title: "Book now",
        last_message: "Book now",
        last_selection_type: "button",
      },
    );
  });

  it("falls back to waiting value when title is absent", () => {
    assert.deepEqual(
      extractInteractiveSelection(
        {
          replyId: "support",
          [INTERACTIVE_SELECTION_INPUT_KEY]: "Support",
        },
        { fallbackHint: "send_list" },
      ),
      {
        last_button_id: "support",
        last_button_title: "Support",
        last_message: "Support",
        last_selection_type: "list",
      },
    );
  });

  it("prefers explicit interactionType over fallback hints", () => {
    assert.deepEqual(
      extractInteractiveSelection({
        replyId: "booking",
        title: "Book now",
        interactionType: "list",
      }, { fallbackHint: "send_buttons" }),
      {
        last_button_id: "booking",
        last_button_title: "Book now",
        last_message: "Book now",
        last_selection_type: "list",
      },
    );
  });

  it("derives selection type from outboundKind set during resume", () => {
    assert.deepEqual(
      extractInteractiveSelection({
        replyId: "booking",
        title: "Book now",
        outboundKind: "buttons",
      }),
      {
        last_button_id: "booking",
        last_button_title: "Book now",
        last_message: "Book now",
        last_selection_type: "button",
      },
    );
  });

  it("derives selection type from channel interactivePayload source", () => {
    assert.deepEqual(
      extractInteractiveSelection({
        replyId: "opt-1",
        title: "Option 1",
        interactivePayload: { source: "list_reply" },
      }),
      {
        last_button_id: "opt-1",
        last_button_title: "Option 1",
        last_message: "Option 1",
        last_selection_type: "list",
      },
    );
  });
});

describe("normalizeInteractionType", () => {
  it("maps every supported alias through one canonical function", () => {
    assert.equal(normalizeInteractionType("buttons"), "button");
    assert.equal(normalizeInteractionType("button_reply"), "button");
    assert.equal(normalizeInteractionType("send_buttons"), "button");
    assert.equal(normalizeInteractionType("list"), "list");
    assert.equal(normalizeInteractionType("list_reply"), "list");
    assert.equal(normalizeInteractionType("send_list"), "list");
    assert.equal(normalizeInteractionType("flow"), "flow");
    assert.equal(normalizeInteractionType("quick_reply"), "quick_reply");
  });

  it("returns undefined for unknown values", () => {
    assert.equal(normalizeInteractionType("unknown"), undefined);
    assert.equal(normalizeInteractionType(""), undefined);
    assert.equal(normalizeInteractionType(null), undefined);
  });
});

describe("buildResumeInput", () => {
  it("passes outbound kind through without mapping it", () => {
    const input = buildResumeInput(
      {
        id: "run-1",
        variables: {
          __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
          __outbound: { kind: "buttons", text: "Choose" },
        },
      } as never,
      "Book now",
      { kind: "interactive_reply", replyId: "booking", title: "Book now" },
    );

    assert.equal(input.outboundKind, "buttons");
    assert.equal(input.replyId, "booking");
    assert.equal(input.title, "Book now");
  });

  it("does not treat plain text as an interactive selection", () => {
    const input = buildResumeInput(
      {
        id: "run-1",
        variables: {
          __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
          __outbound: { kind: "list", title: "Choose a doctor" },
        },
      } as never,
      "Hello",
      {},
    );

    assert.equal(input.interactive_selection, undefined);
    assert.equal(input.replyId, undefined);
    assert.equal(input.title, undefined);
  });

  it("maps plain text into wait_for_reply input keys", () => {
    const input = buildResumeInput(
      {
        id: "run-1",
        variables: {
          __waitingFor: "input",
        },
      } as never,
      "Hello",
      {},
    );

    assert.equal(input.input, "Hello");
  });

  it("prefers list reply id over title for interactive_selection", () => {
    const input = buildResumeInput(
      {
        id: "run-1",
        variables: {
          __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
          __outbound: { kind: "list", title: "Choose a doctor" },
        },
      } as never,
      "Dr Three",
      {
        kind: "interactive_reply",
        replyId: "dr3",
        title: "Dr Three",
        interactionType: "list_reply",
      },
    );

    assert.equal(input.interactive_selection, "dr3");
    assert.equal(input.replyId, "dr3");
    assert.equal(input.title, "Dr Three");
    assert.equal(input.interactionType, "list_reply");
  });
});
