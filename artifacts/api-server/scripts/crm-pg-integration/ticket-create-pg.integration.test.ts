/**
 * Local PG integration: entitled runtime keeps create_ticket, tool persists support_tickets.
 *
 * Boundary (not a live WhatsApp webhook E2E):
 *   buildAgentRuntimeConfiguration → allowedToolKeys
 *   + createTicketAgentTools(createSupabaseTicketAgentToolPorts) → support_tickets row
 *   + permission / commercial entitlement denials
 *
 * Safety: `.env.localstack` only, DEMO companies, tagged disposable subjects, cleanup in after().
 *
 * Run (from artifacts/api-server):
 *   node --import tsx/esm --test scripts/crm-pg-integration/ticket-create-pg.integration.test.ts
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseTicketAgentToolPorts,
  createTicketAgentTools,
} from "@workspace/ai-tool-router";
import {
  createSupabaseTicketAuditPort,
  createTicketPlatformServices,
  TICKET_PERMISSIONS,
} from "@workspace/ticket-platform";
import { buildAgentRuntimeConfiguration } from "../../../login-app/src/lib/ai-employees/adapters/ai-employee-runtime-adapter.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "../../../login-app/src/lib/ai-employees/adapters/ai-employee-runtime-types.js";
import { evaluateCommercialToolAccess } from "../../../login-app/src/lib/ai-employees/utilities/ai-employee-commercial-runtime-gate.js";
import {
  ASSISTANT_B,
  CO_B,
  CrmFixtureTracker,
  TAG,
  assertLocalCrmPgTarget,
  cleanupTracked,
  createAuthUser,
  createConversation,
  createCrmPgClients,
  createCustomer,
  loadLocalstackEnv,
  uniq,
  uniquePhone,
  type PgClient,
} from "./harness.js";

loadLocalstackEnv();
assertLocalCrmPgTarget();

const tracker = new CrmFixtureTracker();
const ticketIds = new Set<string>();

let db: PgClient;
let admin: SupabaseClient;

before(async () => {
  const clients = await createCrmPgClients();
  db = clients.db;
  admin = clients.admin;
});

after(async () => {
  if (ticketIds.size > 0) {
    await db
      .query(`delete from public.support_ticket_comments where ticket_id = any($1::uuid[])`, [[...ticketIds]])
      .catch(() => undefined);
    await db
      .query(
        `delete from public.support_ticket_audit_logs where entity_id::text = any($1::text[])`,
        [[...ticketIds]],
      )
      .catch(() => undefined);
    await db.query(`delete from public.support_tickets where id = any($1::uuid[])`, [[...ticketIds]]);
  }
  await cleanupTracked(db, tracker).catch(() => undefined);
  await db.end();
});

describe("ticket create — local PG (create_ticket runtime + persistence)", () => {
  it("effective allowedToolKeys includes create_ticket when assigned even if DB catalog omits it", () => {
    const preview = buildAgentRuntimeConfiguration({
      employee: {
        id: "agent-ticket-pg",
        name: "ticket-agent",
        displayName: "Ticket Agent",
        status: "published",
        provider: "openai",
        model: "gpt-4.1",
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: "Handle complaints.",
        systemPromptSummary: "Handle complaints.",
        welcomeMessage: "",
        knowledgeSourceIds: [],
        allowedToolKeys: ["create_ticket", "search_ticket"],
        promptVersionLabel: "v1",
        runtimeConfiguration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
      },
      tenantRuntime: {
        providerConnectionId: "provider-conn-1",
        providerConnectionName: "OpenAI Default",
        providerRegistryKey: "openai",
        knowledgeRetrieval: null,
        missing: [],
      },
      knowledgeSources: [],
      toolCatalog: [],
      availableModels: ["gpt-4.1"],
    });
    assert.ok(preview.channelRuntime);
    assert.ok(preview.channelRuntime.pageContext.allowedToolKeys.includes("create_ticket"));
  });

  it("commercial gate denies create_ticket when ai_ticketing entitlement is off", async () => {
    const denied = await evaluateCommercialToolAccess({
      companyId: CO_B,
      toolKey: "create_ticket",
      isFeatureEnabled: async (_companyId, code) => code !== "ai_ticketing",
      isSuperAdmin: false,
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.denialReason, "FEATURE_NOT_ENTITLED");

    const allowed = await evaluateCommercialToolAccess({
      companyId: CO_B,
      toolKey: "create_ticket",
      isFeatureEnabled: async () => true,
      isSuperAdmin: false,
    });
    assert.equal(allowed.allowed, true);
  });

  it("create_ticket tool persists a support_tickets row for the DEMO company", async () => {
    const userId = await createAuthUser(db, "tkt-actor", tracker);
    const phone = uniquePhone();
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("TktCustomer"), phone, email: null },
      tracker,
    );
    const conversationId = await createConversation(
      db,
      {
        companyId: CO_B,
        customerId,
        channelType: "whatsapp",
        assistantId: ASSISTANT_B,
        externalThreadId: uniq("tkt-thread"),
        metadata: { senderExternalId: phone, phone },
      },
      tracker,
    );

    const ports = createSupabaseTicketAgentToolPorts(admin);
    const tools = createTicketAgentTools(ports);
    const createTicket = tools.create_ticket;
    assert.ok(createTicket);

    const subject = `${TAG} complaint integration`;
    const result = await createTicket.execute(
      {
        companyId: CO_B,
        conversationId,
        conversationState: "waiting_user",
        userId,
        trustedCustomerId: customerId,
      },
      {
        subject,
        description: "Synthetic local complaint — do not send outbound.",
        priority: "normal",
      },
    );

    assert.equal(result.success, true);
    assert.ok(typeof result.ticketId === "string" && result.ticketId.length > 0);
    assert.ok(typeof result.ticketNumber === "string" && result.ticketNumber.length > 0);
    ticketIds.add(String(result.ticketId));

    const row = await db.query(
      `select id, company_id, customer_id, conversation_id, subject, status, ticket_number
         from public.support_tickets where id = $1`,
      [result.ticketId],
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].company_id, CO_B);
    assert.equal(row.rows[0].customer_id, customerId);
    assert.equal(row.rows[0].conversation_id, conversationId);
    assert.equal(row.rows[0].subject, subject);
    assert.equal(row.rows[0].status, "open");
    assert.equal(row.rows[0].ticket_number, result.ticketNumber);
  });

  it("ticket create permission denial does not persist a ticket", async () => {
    const userId = await createAuthUser(db, "tkt-deny", tracker);
    const phone = uniquePhone();
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("TktDeny"), phone, email: null },
      tracker,
    );

    const platform = createTicketPlatformServices(admin, {
      audit: createSupabaseTicketAuditPort(admin),
      assignmentGovernance: false,
    });

    let denied = false;
    try {
      await platform.commands.createTicket(
        {
          userId,
          companyId: CO_B,
          isSuperAdmin: false,
          hasPermission: (code) => code !== TICKET_PERMISSIONS.create,
        },
        {
          companyId: CO_B,
          subject: `${TAG} should-not-persist`,
          description: "permission denied",
          customerId,
        },
      );
    } catch (error) {
      denied = true;
      assert.match(String(error instanceof Error ? error.message : error), /permission|denied|tickets\.create/i);
    }
    assert.equal(denied, true);

    const leaked = await db.query(
      `select id from public.support_tickets where company_id = $1 and subject = $2`,
      [CO_B, `${TAG} should-not-persist`],
    );
    assert.equal(leaked.rows.length, 0);
  });
});
