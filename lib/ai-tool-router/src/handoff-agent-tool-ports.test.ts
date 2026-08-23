/**
 * Phase 5F — handoff agent tool ports (per-call company context).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHandoffAgentToolPorts } from "./adapters/supabase-handoff-agent-tool-ports.js";
import type { HandoffPlatformServices } from "@workspace/human-handoff-platform";

describe("createHandoffAgentToolPorts", () => {
  it("builds company-scoped domain context without super-admin", async () => {
    const contexts: Array<{
      companyId: string | null;
      userId: string | null;
      isSuperAdmin: boolean;
      hasPermission: (code: string) => boolean;
    }> = [];

    const platform = {
      commands: {
        escalateConversation: async (ctx: (typeof contexts)[number], input: { companyId: string }) => {
          contexts.push(ctx);
          assert.equal(input.companyId, "company-a");
          return {
            request: { id: "req-1" },
            ownership: { ownerType: "queue", ownerLabel: "Q1" },
          };
        },
        queueConversation: async () => {
          throw new Error("unused");
        },
        returnConversationToAi: async (ctx: (typeof contexts)[number]) => {
          contexts.push(ctx);
          return { ownership: { ownerType: "ai_employee" } };
        },
      },
    } as unknown as HandoffPlatformServices;

    const ports = createHandoffAgentToolPorts({} as never, {
      platform,
      resolveActorUserIdForCompany: async (companyId) => {
        assert.equal(companyId, "company-a");
        return "actor-1";
      },
    });

    await ports.escalateToHuman({
      companyId: "company-a",
      conversationId: "conv-1",
      triggerCode: "customer_requested",
      reason: "Need help",
    });

    assert.equal(contexts.length, 1);
    assert.equal(contexts[0]?.isSuperAdmin, false);
    assert.equal(contexts[0]?.companyId, "company-a");
    assert.equal(contexts[0]?.userId, "actor-1");
    assert.equal(contexts[0]?.hasPermission("handoff.escalate"), true);
    assert.equal(contexts[0]?.hasPermission("platform.admin"), false);
    assert.equal(contexts[0]?.hasPermission("companies.delete"), false);
  });

  it("returnToAi fails closed without resolved actor", async () => {
    const platform = {
      commands: {
        returnConversationToAi: async () => {
          throw new Error("domain should not be called");
        },
      },
    } as unknown as HandoffPlatformServices;

    const ports = createHandoffAgentToolPorts({} as never, {
      platform,
      resolveActorUserIdForCompany: async () => null,
    });

    await assert.rejects(
      () =>
        ports.returnToAi({
          companyId: "company-a",
          conversationId: "conv-1",
          reason: "done",
        }),
      /Authenticated user is required/,
    );
  });
});
