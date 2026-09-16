import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapEmailAiCapabilities,
  mapEmailControlCenterStatus,
  mapEmailRoutingTicketPresentation,
} from "./email-control-center-status.ts";

describe("email control center status mapping", () => {
  it("marks first-time when inbound/outbound are not enabled", () => {
    const snapshot = mapEmailControlCenterStatus({
      settingsLoaded: true,
      settings: {
        enabled: false,
        conversationEnabled: false,
        smtpHost: "",
        fromEmail: "",
      },
      routingEntitled: true,
      routingHasEnabledTarget: false,
      ticketingEntitled: true,
      templateCount: 0,
    });
    assert.equal(snapshot.emailConfigured, false);
    assert.equal(snapshot.cards.find((c) => c.id === "inbound")?.configured, false);
    assert.equal(snapshot.cards.find((c) => c.id === "outbound")?.action, "configure");
  });

  it("uses real health when provided and never invents it", () => {
    const withoutHealth = mapEmailControlCenterStatus({
      settingsLoaded: true,
      settings: {
        enabled: true,
        conversationEnabled: true,
        smtpHost: "smtp.example.com",
        fromEmail: "ops@example.com",
        imapHost: "imap.example.com",
      },
      routingEntitled: true,
      routingHasEnabledTarget: true,
      ticketingEntitled: true,
      templateCount: 2,
    });
    assert.equal(withoutHealth.emailConfigured, true);
    assert.equal(withoutHealth.cards.find((c) => c.id === "outbound")?.health, null);

    const withHealth = mapEmailControlCenterStatus({
      settingsLoaded: true,
      settings: {
        enabled: true,
        conversationEnabled: true,
        smtpHost: "smtp.example.com",
        fromEmail: "ops@example.com",
        imapHost: "imap.example.com",
      },
      routingEntitled: true,
      routingHasEnabledTarget: true,
      ticketingEntitled: true,
      templateCount: 2,
      outboundHealthOk: false,
    });
    assert.equal(withHealth.cards.find((c) => c.id === "outbound")?.health, "needs_attention");
    assert.equal(withHealth.cards.find((c) => c.id === "outbound")?.action, "fix");
  });

  it("locks routing when entitlement is false", () => {
    const snapshot = mapEmailControlCenterStatus({
      settingsLoaded: true,
      settings: {
        enabled: true,
        conversationEnabled: true,
        smtpHost: "smtp.example.com",
        fromEmail: "ops@example.com",
      },
      routingEntitled: false,
      routingHasEnabledTarget: false,
      ticketingEntitled: false,
      templateCount: null,
    });
    assert.equal(snapshot.cards.find((c) => c.id === "routing")?.action, "upgrade");
    assert.equal(snapshot.cards.find((c) => c.id === "tickets")?.configured, false);
  });

  it("maps AI capability gates without inventing entitlement", () => {
    const caps = mapEmailAiCapabilities({
      routingEntitled: true,
      assistantEntitled: undefined,
      suggestedRepliesEntitled: false,
    });
    assert.equal(caps.find((c) => c.id === "routing")?.entitled, true);
    assert.equal(caps.find((c) => c.id === "composer")?.entitled, undefined);
    assert.equal(caps.find((c) => c.id === "suggested_replies")?.entitled, false);
    assert.equal(caps.find((c) => c.id === "summary")?.entitled, undefined);
  });

  it("uses root-escape hrefs so Email nest does not prefix dashboard paths", () => {
    const snapshot = mapEmailControlCenterStatus({
      settingsLoaded: true,
      settings: {
        enabled: true,
        conversationEnabled: true,
        smtpHost: "smtp.example.com",
        fromEmail: "ops@example.com",
        imapHost: "imap.example.com",
      },
      routingEntitled: true,
      routingHasEnabledTarget: true,
      ticketingEntitled: true,
      templateCount: 1,
    });
    for (const card of snapshot.cards) {
      assert.match(card.href, /^~\/dashboard\//);
      assert.doesNotMatch(card.href, /^\/dashboard\//);
    }
  });

  it("presents ticket automation from existing routing resolution only", () => {
    assert.equal(
      mapEmailRoutingTicketPresentation({ enabled: true, targetId: "emp-1" }),
      "create_or_reuse",
    );
    assert.equal(
      mapEmailRoutingTicketPresentation({ enabled: true, targetId: null }),
      "manual_review",
    );
  });
});
