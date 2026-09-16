import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateEmailInboundAutoReplyGuard,
  normalizeEmailAddress,
} from "./email-inbound-auto-reply-guard.ts";

describe("email inbound auto-reply guard", () => {
  it("normalizes addresses case-insensitively", () => {
    assert.equal(normalizeEmailAddress(" Omar@Gmail.COM "), "omar@gmail.com");
    assert.equal(normalizeEmailAddress("ValueOR <omar@gmail.com>"), "omar@gmail.com");
  });

  it("skips persist when Message-ID already exists as outgoing (IMAP echo)", () => {
    const decision = evaluateEmailInboundAutoReplyGuard({
      fromEmail: "support@example.com",
      companyFromEmail: "support@example.com",
      alreadyExistsAsOutgoing: true,
      alreadyExistsAsIncoming: false,
    });
    assert.equal(decision.skipPersist, true);
    assert.equal(decision.forceDisableAi, true);
    assert.equal(decision.reason, "own_outbound_message_id_echo");
  });

  it("disables AI when From equals company mailbox (self-mail / support echo)", () => {
    const decision = evaluateEmailInboundAutoReplyGuard({
      fromEmail: "omar.abdelaziz.mokhtar22@gmail.com",
      companyFromEmail: "omar.abdelaziz.mokhtar22@gmail.com",
      alreadyExistsAsOutgoing: false,
    });
    assert.equal(decision.skipPersist, false);
    assert.equal(decision.forceDisableAi, true);
    assert.equal(decision.reason, "from_matches_company_mailbox");
  });

  it("allows AI decision for genuine customer From when not an echo", () => {
    const decision = evaluateEmailInboundAutoReplyGuard({
      fromEmail: "customer@example.com",
      companyFromEmail: "support@example.com",
      alreadyExistsAsOutgoing: false,
    });
    assert.equal(decision.skipPersist, false);
    assert.equal(decision.forceDisableAi, false);
    assert.equal(decision.reason, "allow");
  });

  it("11: inbound does not auto-send when guard forces disable (executeAi caller AND)", () => {
    const decision = evaluateEmailInboundAutoReplyGuard({
      fromEmail: "support@example.com",
      companyFromEmail: "support@example.com",
      alreadyExistsAsOutgoing: false,
    });
    const executeAiRequested = true;
    const effectiveExecuteAi = executeAiRequested && !decision.forceDisableAi;
    assert.equal(effectiveExecuteAi, false);
  });

  it("15/17: duplicate echo of same outbound Message-ID cannot trigger second autonomous response", () => {
    const first = evaluateEmailInboundAutoReplyGuard({
      fromEmail: "support@example.com",
      companyFromEmail: "support@example.com",
      alreadyExistsAsOutgoing: true,
    });
    const second = evaluateEmailInboundAutoReplyGuard({
      fromEmail: "support@example.com",
      companyFromEmail: "support@example.com",
      alreadyExistsAsOutgoing: true,
    });
    assert.equal(first.skipPersist, true);
    assert.equal(second.skipPersist, true);
  });

  it("skips persist when Message-ID already exists as incoming for the company", () => {
    const decision = evaluateEmailInboundAutoReplyGuard({
      fromEmail: "customer@example.com",
      companyFromEmail: "support@example.com",
      alreadyExistsAsOutgoing: false,
      alreadyExistsAsIncoming: true,
    });
    assert.equal(decision.skipPersist, true);
    assert.equal(decision.forceDisableAi, true);
    assert.equal(decision.reason, "duplicate_inbound_message_id");
  });
});
