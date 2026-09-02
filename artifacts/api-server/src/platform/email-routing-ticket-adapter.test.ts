/**
 * B1.2 MEDIUM-FIX — email-routing ticket adapter narrow authorization.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { TICKET_PERMISSIONS, TicketPermissionDeniedError } from "@workspace/ticket-platform";
import {
  assertTicketCompanyAccess,
  assertTicketPermission,
} from "../../../../lib/ticket-platform/src/validators/ticket-guards.js";
import {
  buildEmailRoutingTicketServiceContext,
  EMAIL_ROUTING_TICKET_PERMISSIONS,
  createEmailRoutingTicketActionPort,
} from "./email-routing-ticket-adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const adapterSource = readFileSync(resolve(here, "email-routing-ticket-adapter.ts"), "utf8");
const inboundSource = readFileSync(
  resolve(here, "../../../../lib/channel-platform/src/pipelines/inbound-message-pipeline.ts"),
  "utf8",
);
const commercialAdapterSource = readFileSync(
  resolve(here, "ai-email-routing-commercial-adapter.ts"),
  "utf8",
);

describe("B1.2 MEDIUM-FIX — email routing ticket ServiceContext", () => {
  it("A/B/C entitled machine context is company-scoped, not super-admin, not allow-all", () => {
    const ctx = buildEmailRoutingTicketServiceContext("company-1", "actor-1");
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.companyId, "company-1");
    assert.equal(ctx.userId, "actor-1");
    assert.equal(ctx.hasPermission(TICKET_PERMISSIONS.view), true);
    assert.equal(ctx.hasPermission(TICKET_PERMISSIONS.create), true);
    assert.equal(ctx.hasPermission(TICKET_PERMISSIONS.assign), true);
    assert.equal(ctx.hasPermission(TICKET_PERMISSIONS.edit), false);
    assert.equal(ctx.hasPermission(TICKET_PERMISSIONS.close), false);
    assert.equal(ctx.hasPermission(TICKET_PERMISSIONS.manage), false);
    assert.equal(ctx.hasPermission(TICKET_PERMISSIONS.comment), false);
    assert.equal(ctx.hasPermission("platform.admin"), false);
  });

  it("D required narrow permissions are the only allowlist entries", () => {
    assert.deepEqual(
      [...EMAIL_ROUTING_TICKET_PERMISSIONS].sort(),
      [TICKET_PERMISSIONS.assign, TICKET_PERMISSIONS.create, TICKET_PERMISSIONS.view].sort(),
    );
  });

  it("E missing required permission → DENY at ticket guards", () => {
    const ctx = buildEmailRoutingTicketServiceContext("company-1", "actor-1");
    assert.throws(
      () => assertTicketPermission(ctx, TICKET_PERMISSIONS.manage),
      TicketPermissionDeniedError,
    );
    assert.throws(
      () => assertTicketPermission(ctx, TICKET_PERMISSIONS.close),
      TicketPermissionDeniedError,
    );
    assert.doesNotThrow(() => assertTicketPermission(ctx, TICKET_PERMISSIONS.create));
    assert.doesNotThrow(() => assertTicketPermission(ctx, TICKET_PERMISSIONS.assign));
    assert.doesNotThrow(() => assertTicketPermission(ctx, TICKET_PERMISSIONS.view));
  });

  it("F missing companyId / actor → DENY", () => {
    assert.throws(
      () => buildEmailRoutingTicketServiceContext("", "actor-1"),
      /Company context is required/,
    );
    assert.throws(
      () => buildEmailRoutingTicketServiceContext(null, "actor-1"),
      /Company context is required/,
    );
    assert.throws(
      () => buildEmailRoutingTicketServiceContext("company-1", ""),
      /authenticated user is required/,
    );
    assert.throws(
      () => buildEmailRoutingTicketServiceContext("company-1", null),
      /authenticated user is required/,
    );
  });

  it("G cross-company ticket context → DENY", () => {
    const ctx = buildEmailRoutingTicketServiceContext("company-a", "actor-1");
    assert.throws(
      () => assertTicketCompanyAccess(ctx, "company-b"),
      TicketPermissionDeniedError,
    );
    assert.doesNotThrow(() => assertTicketCompanyAccess(ctx, "company-a"));
  });

  it("source contract: no fabricated super-admin / allow-all", () => {
    assert.doesNotMatch(adapterSource, /isSuperAdmin:\s*true/);
    assert.doesNotMatch(adapterSource, /hasPermission:\s*\(\)\s*=>\s*true/);
    assert.match(adapterSource, /isSuperAdmin:\s*false/);
    assert.match(adapterSource, /buildEmailRoutingTicketServiceContext/);
    assert.match(adapterSource, /EMAIL_ROUTING_TICKET_PERMISSIONS/);
  });

  it("H email-routing commercial remains upstream fail-closed (not replaced by ticket adapter)", () => {
    assert.match(inboundSource, /aiEmailRoutingCommercial/);
    assert.match(inboundSource, /emailRoutingTickets/);
    assert.match(commercialAdapterSource, /is_feature_enabled/);
    assert.match(commercialAdapterSource, /AI_EMAIL_ROUTING_FEATURE_CODE/);
  });

  it("I ticketing commercial is not granted by email-routing adapter", () => {
    assert.doesNotMatch(adapterSource, /is_feature_enabled/);
    assert.doesNotMatch(adapterSource, /ticketing/);
    // Adapter only bridges ticket RBAC narrowly; commercial channel/routing stay outside.
  });

  it("J createEmailRoutingTicketActionPort fails closed when actor missing; empty company skips", async () => {
    const port = createEmailRoutingTicketActionPort({} as never, {
      resolveActorUserIdForCompany: async () => null,
    });
    await assert.rejects(
      () =>
        port.apply({
          companyId: "company-1",
          conversationId: "conv-1",
          inboundEventId: "evt-1",
          subject: "Help",
          classification: {
            category: "support",
            confidence: 0.9,
            reason: "test",
            source: "test",
          },
          decision: {
            targetType: "employee",
            targetId: "user-1",
            category: "support",
            confidence: 0.9,
            reason: "test",
            source: "test",
            configurationRequired: false,
          },
        }),
      /authenticated user is required/,
    );

    const portMissingCompany = createEmailRoutingTicketActionPort({} as never, {
      resolveActorUserIdForCompany: async () => "actor-1",
    });
    const skipped = await portMissingCompany.apply({
      companyId: "",
      conversationId: "conv-1",
      inboundEventId: "evt-1",
      subject: "Help",
      classification: {
        category: "support",
        confidence: 0.9,
        reason: "test",
        source: "test",
      },
      decision: {
        targetType: "employee",
        targetId: "user-1",
        category: "support",
        confidence: 0.9,
        reason: "test",
        source: "test",
        configurationRequired: false,
      },
    });
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.reason, "missing_company");
  });
});
