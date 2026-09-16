import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD,
  buildEmailComposerDraftPatch,
  mergeRecipientEmails,
  normalizeRecipientEmails,
  parseRecipientList,
  readDraftRecipientField,
  readEmailComposerDraft,
  serializeRecipientListForDisplay,
} from "./email-thread-outbound.ts";
import { evaluateNewEmailSend, invalidComposerAddresses } from "./email-compose-new.ts";
import { buildEmailComposerOutbound, toEmailOutboundDispatchMetadata } from "@workspace/channel-platform";

describe("multi-Cc recipient parsing", () => {
  it("parses one Cc recipient", () => {
    assert.deepEqual(parseRecipientList("a@example.com"), ["a@example.com"]);
  });

  it("parses two and 10+ Cc recipients", () => {
    assert.deepEqual(parseRecipientList("a@example.com, b@example.com"), [
      "a@example.com",
      "b@example.com",
    ]);
    const many = Array.from({ length: 12 }, (_, i) => `user${i}@example.com`);
    assert.equal(parseRecipientList(many.join(";")).length, 12);
  });

  it("parses paste separators: comma, semicolon, newline, whitespace", () => {
    assert.deepEqual(
      parseRecipientList("john@example.com,\nmary@example.com; support@example.com"),
      ["john@example.com", "mary@example.com", "support@example.com"],
    );
    assert.deepEqual(parseRecipientList("a@x.com  b@y.com\tc@z.com"), [
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("deduplicates case-insensitively while preserving first casing", () => {
    assert.deepEqual(normalizeRecipientEmails(["John@Example.com", "john@example.com", "JOHN@example.com"]), [
      "John@Example.com",
    ]);
  });

  it("identifies invalid addresses without dropping valid ones", () => {
    const list = parseRecipientList("good@example.com, not-an-email, also@ok.com");
    assert.deepEqual(list, ["good@example.com", "not-an-email", "also@ok.com"]);
    assert.deepEqual(invalidComposerAddresses(list), ["not-an-email"]);
  });

  it("enforces soft per-field recipient limit without losing existing", () => {
    const existing = Array.from({ length: 3 }, (_, i) => `keep${i}@example.com`);
    const incoming = Array.from({ length: 120 }, (_, i) => `new${i}@example.com`);
    const merged = mergeRecipientEmails(existing, incoming, 100);
    assert.equal(merged.truncated, true);
    assert.equal(merged.list.length, 100);
    assert.ok(merged.list.includes("keep0@example.com"));
  });

  it("blocks send when Cc exceeds soft limit", () => {
    const cc = Array.from({ length: EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD + 1 }, (_, i) => `c${i}@example.com`);
    const gate = evaluateNewEmailSend({
      to: ["to@example.com"],
      cc,
      subject: "Hi",
      body: "Body",
      attachmentCount: 0,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.reason, "recipient_limit");
      assert.equal(gate.field, "cc");
    }
  });

  it("allows Send with many valid Cc recipients under the limit", () => {
    const cc = Array.from({ length: 15 }, (_, i) => `cc${i}@example.com`);
    const gate = evaluateNewEmailSend({
      to: ["to@example.com"],
      cc,
      subject: "Hi",
      body: "Body",
      attachmentCount: 0,
    });
    assert.equal(gate.ok, true);
  });
});

describe("multi-Cc draft persistence", () => {
  it("stores Cc as string[] and restores after refresh-style read", () => {
    const cc = Array.from({ length: 8 }, (_, i) => `cc${i}@valueor-test.local`);
    const metadata = buildEmailComposerDraftPatch({}, {
      mode: "compose",
      to: ["to@valueor-test.local"],
      cc,
      bcc: ["secret@valueor-test.local"],
      subject: "Multi Cc draft",
      body: "hello",
      updatedAt: new Date().toISOString(),
      attachments: [],
    });
    const stored = (metadata.emailComposerDraft as { cc: unknown }).cc;
    assert.ok(Array.isArray(stored));
    assert.deepEqual(stored, cc);

    const restored = readEmailComposerDraft(metadata);
    assert.deepEqual(restored?.cc, cc);
    assert.deepEqual(restored?.bcc, ["secret@valueor-test.local"]);
  });

  it("reads legacy comma-separated Cc drafts into arrays", () => {
    assert.deepEqual(
      readDraftRecipientField("a@example.com, b@example.com; c@example.com"),
      ["a@example.com", "b@example.com", "c@example.com"],
    );
    const restored = readEmailComposerDraft({
      emailComposerDraft: {
        mode: "compose",
        to: "to@example.com",
        cc: "one@example.com, two@example.com",
        bcc: "",
        subject: "Legacy",
        body: "",
        updatedAt: new Date().toISOString(),
        attachments: [],
      },
    });
    assert.deepEqual(restored?.to, ["to@example.com"]);
    assert.deepEqual(restored?.cc, ["one@example.com", "two@example.com"]);
    assert.deepEqual(restored?.bcc, []);
  });
});

describe("multi-Cc outbound payload and MIME metadata", () => {
  it("outbound metadata keeps Cc as array separate from To and Bcc", () => {
    const built = buildEmailComposerOutbound({
      mode: "compose",
      snapshot: {
        from: null,
        to: [],
        cc: [],
        subject: "S",
        lastInboundMessageId: null,
        threadRootMessageId: null,
        references: [],
      },
      to: ["to@example.com"],
      cc: ["c1@example.com", "c2@example.com", "c3@example.com"],
      bcc: ["secret@example.com"],
      subject: "Multi Cc send",
    });
    assert.deepEqual(built.to, ["to@example.com"]);
    assert.deepEqual(built.cc, ["c1@example.com", "c2@example.com", "c3@example.com"]);
    assert.deepEqual(built.bcc, ["secret@example.com"]);

    const metadata = toEmailOutboundDispatchMetadata(built);
    assert.deepEqual(metadata.recipientEmails, ["to@example.com"]);
    assert.deepEqual(metadata.cc, ["c1@example.com", "c2@example.com", "c3@example.com"]);
    assert.deepEqual(metadata.bcc, ["secret@example.com"]);
    assert.notEqual(JSON.stringify(metadata.cc), JSON.stringify(metadata.recipientEmails));
  });

  it("does not concatenate Cc into a single invalid address", () => {
    const list = parseRecipientList(["a@example.com", "b@example.com"]);
    assert.equal(serializeRecipientListForDisplay(list).includes("@"), true);
    assert.equal(list.length, 2);
    assert.ok(!list.some((item) => item.includes(",")));
  });
});
