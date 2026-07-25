import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendOutboundQueueEntry,
  outboundEntryDisplayText,
  readLatestOutbound,
  readOutboundQueue,
  resetOutboundQueue,
} from "./outbound-queue.js";

describe("outbound queue", () => {
  it("appends entries in order and mirrors the latest to __outbound", () => {
    let variables: Record<string, unknown> = resetOutboundQueue({});
    variables = appendOutboundQueueEntry(variables, { kind: "text", text: "First" });
    variables = appendOutboundQueueEntry(variables, { kind: "text", text: "Second" });

    assert.deepEqual(readOutboundQueue(variables).map((entry) => entry.text), ["First", "Second"]);
    assert.equal(readLatestOutbound(variables)?.text, "Second");
    assert.equal((variables.__outbound as { text?: string }).text, "Second");
  });

  it("reads legacy __outbound when queue is absent", () => {
    const variables = { __outbound: { kind: "text", text: "Legacy only" } };
    assert.equal(readLatestOutbound(variables)?.text, "Legacy only");
    assert.deepEqual(readOutboundQueue(variables), []);
  });

  it("derives display text for list and media entries", () => {
    assert.equal(
      outboundEntryDisplayText({ kind: "list", title: "Menu", body: "Pick one" }),
      "Pick one",
    );
    assert.equal(
      outboundEntryDisplayText({ kind: "image", caption: "Photo caption" }),
      "Photo caption",
    );
  });
});
