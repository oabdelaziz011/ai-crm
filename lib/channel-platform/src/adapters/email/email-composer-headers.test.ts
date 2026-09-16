import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailComposerOutbound,
  buildForwardQuotedBody,
  buildReplyAllParticipants,
  buildReplyParticipants,
  toEmailOutboundDispatchMetadata,
} from "./email-composer-headers.js";

const snapshot = {
  from: { email: "customer@example.com", name: "Customer" },
  to: [
    { email: "support@company.com" },
    { email: "partner@external.com" },
  ],
  cc: [{ email: "cc@external.com" }, { email: "customer@example.com" }],
  lastInboundMessageId: "<inbound-1@example.com>",
  references: ["root@example.com", "inbound-1@example.com"],
  threadRootMessageId: "root@example.com",
  subject: "Need help",
  companyMailboxes: ["support@company.com"],
};

describe("email-composer-headers", () => {
  it("Reply targets only the From address and excludes company mailbox", () => {
    const participants = buildReplyParticipants(snapshot, {
      agentMailbox: "agent@company.com",
    });
    assert.deepEqual(participants.to, ["customer@example.com"]);
    assert.deepEqual(participants.cc, []);
  });

  it("Reply All dedupes From and company mailboxes from Cc", () => {
    const participants = buildReplyAllParticipants(snapshot, {
      agentMailbox: "agent@company.com",
    });
    assert.deepEqual(participants.to, ["customer@example.com"]);
    assert.ok(!participants.cc.includes("customer@example.com"));
    assert.ok(!participants.cc.includes("support@company.com"));
    assert.ok(participants.cc.includes("partner@external.com"));
    assert.ok(participants.cc.includes("cc@external.com"));
  });

  it("Reply outbound metadata preserves In-Reply-To and References", () => {
    const built = buildEmailComposerOutbound({ mode: "reply", snapshot });
    const metadata = toEmailOutboundDispatchMetadata(built);
    assert.equal(metadata.recipientEmail, "customer@example.com");
    assert.equal(metadata.inReplyTo, "inbound-1@example.com");
    assert.equal(metadata.emailSubject, "Re: Need help");
    assert.ok(Array.isArray(metadata.emailReferences));
    assert.ok((metadata.emailReferences as string[]).includes("root@example.com"));
  });

  it("Forward uses Fwd subject, clears threading, and quotes public context only", () => {
    const built = buildEmailComposerOutbound({
      mode: "forward",
      snapshot,
      to: ["other@example.com"],
    });
    assert.equal(built.emailSubject, "Fwd: Need help");
    assert.equal(built.inReplyTo, undefined);
    assert.equal(built.emailReferences, undefined);
    assert.equal(built.recipientEmail, "other@example.com");

    const quoted = buildForwardQuotedBody({
      from: snapshot.from,
      to: snapshot.to,
      subject: snapshot.subject,
      date: "2026-01-01T00:00:00.000Z",
      body: "Customer asked for help",
    });
    assert.match(quoted, /Forwarded message/);
    assert.match(quoted, /Customer asked for help/);
    assert.doesNotMatch(quoted, /aiRouting|internal|reasoning/i);
  });

  it("compose outbound uses caller recipients and does not add reply headers", () => {
    const built = buildEmailComposerOutbound({
      mode: "compose",
      snapshot,
      to: ["prospect@example.com", "second@example.com"],
      cc: ["cc@example.com"],
      subject: "Introduction",
    });
    const metadata = toEmailOutboundDispatchMetadata(built);
    assert.equal(built.recipientEmail, "prospect@example.com");
    assert.deepEqual(built.to, ["prospect@example.com", "second@example.com"]);
    assert.deepEqual(metadata.recipientEmails, ["prospect@example.com", "second@example.com"]);
    assert.equal(built.emailSubject, "Introduction");
    assert.equal(built.inReplyTo, undefined);
    assert.equal(built.emailReferences, undefined);
    assert.equal(built.threadRootMessageId, undefined);
    assert.equal(metadata.emailComposerMode, "compose");
  });
});
