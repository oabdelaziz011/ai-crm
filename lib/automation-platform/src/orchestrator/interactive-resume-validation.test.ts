import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InteractiveResumeValidationError } from "../errors.js";
import { INTERACTIVE_SELECTION_INPUT_KEY } from "../runtime/conversation-variables.js";
import { validateInteractiveResumeInput } from "./interactive-resume-validation.js";
import type { AutomationNodeRecord, AutomationRunRecord } from "../types.js";

function runWaitingOnList(): AutomationRunRecord {
  return {
    id: "run-1",
    company_id: "company-1",
    flow_id: "flow-1",
    status: "waiting_input",
    trigger_source: "inbound_message",
    started_at: new Date().toISOString(),
    finished_at: null,
    error_message: null,
    metadata: {},
    flow_version_id: "version-1",
    current_node_id: "list-1",
    session_id: "session-1",
    variables: {
      __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
      __outbound: {
        kind: "list",
        body: "اختَر الخيار الأنسب لك.",
        sections: [{ rows: [{ id: "svc-teeth", title: "عياده اسنان" }] }],
      },
    },
  };
}

function listNode(): AutomationNodeRecord {
  return {
    id: "list-1",
    flow_id: "flow-1",
    type: "action",
    config: { action: "send_list", outputVariable: "selected_service" },
    position_x: 0,
    position_y: 0,
    created_at: new Date().toISOString(),
  };
}

function buttonNode(): AutomationNodeRecord {
  return {
    id: "buttons-1",
    flow_id: "flow-1",
    type: "action",
    config: { action: "send_buttons" },
    position_x: 0,
    position_y: 0,
    created_at: new Date().toISOString(),
  };
}

describe("validateInteractiveResumeInput", () => {
  it("accepts Instagram quick_reply taps while waiting on send_list", () => {
    assert.doesNotThrow(() =>
      validateInteractiveResumeInput({
        run: runWaitingOnList(),
        currentNode: listNode(),
        resumeInput: {
          kind: "interactive_reply",
          interactionType: "quick_reply",
          replyId: "svc-teeth",
          title: "عياده اسنان",
        },
      }),
    );
  });

  it("still rejects WhatsApp button replies while waiting on send_list", () => {
    assert.throws(
      () =>
        validateInteractiveResumeInput({
          run: runWaitingOnList(),
          currentNode: listNode(),
          resumeInput: {
            kind: "interactive_reply",
            interactionType: "button_reply",
            replyId: "svc-teeth",
          },
        }),
      (error: unknown) =>
        error instanceof InteractiveResumeValidationError &&
        error.message.includes("received a button reply"),
    );
  });

  it("accepts Instagram quick_reply taps while waiting on send_buttons", () => {
    assert.doesNotThrow(() =>
      validateInteractiveResumeInput({
        run: {
          ...runWaitingOnList(),
          current_node_id: "buttons-1",
          variables: {
            __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
            __outbound: {
              kind: "buttons",
              text: "تحب تسألي عن حاجة تانية، ولا خلاص؟",
              buttons: [{ id: "something_else", label: "حاجة تانية" }],
            },
          },
        },
        currentNode: buttonNode(),
        resumeInput: {
          kind: "interactive_reply",
          interactionType: "quick_reply",
          replyId: "something_else",
          title: "حاجة تانية",
        },
      }),
    );
  });
});
