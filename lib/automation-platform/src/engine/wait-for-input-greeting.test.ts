import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createActionNodeHandler } from "./built-in-nodes.js";
import type { ExecutionContext } from "./execution-context.js";
import { readOutboundQueue } from "../runtime/outbound-queue.js";

function buildWaitContext(input: {
  prompt: string;
  inputKey?: string;
  resumeValue?: string;
  variables?: Record<string, unknown>;
  action?: "wait_for_input" | "send_message";
  message?: string;
}): ExecutionContext {
  const action = input.action ?? "wait_for_input";
  return {
    company: { id: "company-1" },
    flow: { id: "flow-1", company_id: "company-1", name: "Flow", status: "active" } as ExecutionContext["flow"],
    run: { id: "run-1", metadata: { actorUserId: "user-1" } } as ExecutionContext["run"],
    session: { id: "session-1", channel: "instagram", metadata: {} } as ExecutionContext["session"],
    variables: {
      conversation: { language: "ar" },
      ...(input.variables ?? {}),
    },
    customer: { id: null },
    currentNode: {
      id: "node-wait",
      type: "action",
      config:
        action === "send_message"
          ? { action, message: input.message ?? "Hello 👋 Welcome to our clinic." }
          : { action, inputKey: input.inputKey ?? "customer_intent", prompt: input.prompt },
    } as ExecutionContext["currentNode"],
    nodes: [],
    edges: [],
    input:
      action === "wait_for_input" && input.resumeValue != null
        ? { [input.inputKey ?? "customer_intent"]: input.resumeValue }
        : undefined,
  };
}

describe("wait_for_input greeting-only replies", () => {
  const handler = createActionNodeHandler();

  it("does not consume مرحبا as customer_intent and asks how to help", async () => {
    const result = await handler.execute(
      buildWaitContext({
        prompt: "وضح طلبك لو سمحت",
        resumeValue: "مرحبا",
      }),
    );

    assert.equal(result.outcome, "waiting_input");
    assert.equal(result.variables?.__waitingFor, "customer_intent");
    assert.equal(result.variables?.customer_intent, null);
    assert.equal(result.variables?.__prompt, "اهلا بيك يا فندم اقدر اساعدك ازاي ؟");
    assert.equal(readOutboundQueue(result.variables ?? {}).at(-1)?.text, result.variables?.__prompt);
  });

  it("does not consume هالو as intent", async () => {
    const result = await handler.execute(
      buildWaitContext({
        prompt: "اهلا بيك يا فندم اقدر اساعدك ازاي ؟",
        resumeValue: "هالو",
      }),
    );

    assert.equal(result.outcome, "waiting_input");
    assert.equal(result.variables?.__waitingFor, "customer_intent");
    assert.equal(result.variables?.__prompt, "اهلا بيك يا فندم اقدر اساعدك ازاي ؟");
  });

  it("does not consume a prefilled phone during intent reentry", async () => {
    const result = await handler.execute(
      buildWaitContext({
        prompt: "ما هو رقم التليفون؟",
        inputKey: "customer_phone",
        variables: {
          customer_phone: "28312734118386048",
          customer_intent: "عايزه الغي ميعاد حجز",
          __reentryConsumeIntent: true,
        },
      }),
    );

    assert.equal(result.outcome, "waiting_input");
    assert.equal(result.variables?.__waitingFor, "customer_phone");
    assert.equal(result.variables?.__prompt, "ما هو رقم التليفون؟");
  });

  it("still accepts a real intent", async () => {
    const result = await handler.execute(
      buildWaitContext({
        prompt: "وضح طلبك لو سمحت",
        resumeValue: "عايز أحجز",
      }),
    );

    assert.equal(result.outcome, "continue");
    assert.equal(result.variables?.customer_intent, "عايز أحجز");
    assert.equal(result.variables?.__waitingFor, null);
  });

  it("sends welcome when reentry skip is set but inbound is a greeting", async () => {
    const result = await handler.execute(
      buildWaitContext({
        prompt: "",
        action: "send_message",
        message: "Hello 👋 Welcome to our clinic.",
        variables: {
          lastMessage: "مرحبا",
          __reentrySkipWelcome: true,
        },
      }),
    );

    assert.equal(result.outcome, "continue");
    assert.equal(result.variables?.__reentrySkipWelcome, null);
    assert.equal(readOutboundQueue(result.variables ?? {}).at(-1)?.text, "Hello 👋 Welcome to our clinic.");
  });

  it("still skips welcome for a real intent reentry", async () => {
    const result = await handler.execute(
      buildWaitContext({
        prompt: "",
        action: "send_message",
        message: "Hello 👋 Welcome to our clinic.",
        variables: {
          lastMessage: "عايز أحجز",
          __reentrySkipWelcome: true,
        },
      }),
    );

    assert.equal(result.outcome, "continue");
    assert.equal(result.variables?.__reentrySkipWelcome, null);
    assert.equal(readOutboundQueue(result.variables ?? {}).length, 0);
  });
});
