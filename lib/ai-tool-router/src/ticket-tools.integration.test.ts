import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ToolRouterService,
  createTicketAgentTools,
  createToolHandlerRegistry,
  CREATE_TICKET_TOOL_KEY,
  ASSIGN_TICKET_TOOL_KEY,
  CLOSE_TICKET_TOOL_KEY,
  ADD_TICKET_COMMENT_TOOL_KEY,
  resolveLlmToolExposure,
  listRegisteredToolHandlerKeys,
} from "./index.js";
import type { TicketAgentToolPorts } from "./tools/ticket-agent-ports.js";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "./repositories/tool-repositories.js";
import type { ConversationReader } from "./ports/conversation-reader.js";

function createStubTicketPorts(): TicketAgentToolPorts {
  return {
    async createTicket(input) {
      return {
        ticket: {
          id: "ticket-created-1",
          ticketNumber: "TKT-000010",
          subject: input.subject,
          description: input.description ?? "",
          status: "open",
          priority: input.priority ?? "normal",
          customerId: input.customerId ?? null,
          conversationId: input.conversationId ?? null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
        },
      };
    },
    async updateTicket(input) {
      return {
        ticket: {
          id: input.ticketId,
          ticketNumber: "TKT-000010",
          subject: input.subject ?? "Updated",
          description: input.description ?? "",
          status: "open",
          priority: "normal",
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
        },
      };
    },
    async closeTicket(input) {
      return {
        ticket: {
          id: input.ticketId,
          ticketNumber: "TKT-000010",
          subject: "Closed",
          description: "",
          status: input.status ?? "closed",
          priority: "normal",
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      };
    },
    async assignTicket(input) {
      return {
        ticket: {
          id: input.ticketId,
          ticketNumber: "TKT-000010",
          subject: "Assigned",
          description: "",
          status: "in_progress",
          priority: "normal",
          customerId: null,
          conversationId: null,
          assignedUserId: input.assigneeUserId ?? "agent-1",
          assignedUserName: input.assigneeName ?? "Ahmed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
        },
      };
    },
    async addTicketComment(input) {
      return { commentId: "comment-1", ticketId: input.ticketId };
    },
    async changeTicketPriority(input) {
      return {
        ticket: {
          id: input.ticketId,
          ticketNumber: "TKT-000010",
          subject: "Priority",
          description: "",
          status: "open",
          priority: input.priority,
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
        },
      };
    },
    async changeTicketStatus(input) {
      return {
        ticket: {
          id: input.ticketId,
          ticketNumber: "TKT-000010",
          subject: "Status",
          description: "",
          status: input.status,
          priority: "normal",
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
        },
      };
    },
    async searchTickets() {
      return { tickets: [], total: 0 };
    },
  };
}

function createDefinition(key: string, permissions: string[]): ToolDefinitionRepository {
  const definitions = new Map([
    [
      CREATE_TICKET_TOOL_KEY,
      {
        id: "def-create-ticket",
        key: CREATE_TICKET_TOOL_KEY,
        display_name: "Create Ticket",
        description: "Create ticket",
        category: "support",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: permissions,
        supported_states: ["waiting_user"],
        input_schema: { type: "object", properties: { subject: { type: "string" } }, required: ["subject"] },
        output_schema: { type: "object" },
        timeout_ms: 30000,
        retry_policy: { maxAttempts: 1, backoffMs: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    [
      ASSIGN_TICKET_TOOL_KEY,
      {
        id: "def-assign-ticket",
        key: ASSIGN_TICKET_TOOL_KEY,
        display_name: "Assign Ticket",
        description: "Assign ticket",
        category: "support",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: ["tools.execute", "tickets.assign"],
        supported_states: ["waiting_user"],
        input_schema: {
          type: "object",
          properties: { ticketId: { type: "string" }, assigneeName: { type: "string" } },
          required: ["ticketId"],
        },
        output_schema: { type: "object" },
        timeout_ms: 30000,
        retry_policy: { maxAttempts: 1, backoffMs: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    [
      CLOSE_TICKET_TOOL_KEY,
      {
        id: "def-close-ticket",
        key: CLOSE_TICKET_TOOL_KEY,
        display_name: "Close Ticket",
        description: "Close ticket",
        category: "support",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: ["tools.execute", "tickets.close"],
        supported_states: ["waiting_user"],
        input_schema: {
          type: "object",
          properties: { ticketId: { type: "string" } },
          required: ["ticketId"],
        },
        output_schema: { type: "object" },
        timeout_ms: 30000,
        retry_policy: { maxAttempts: 1, backoffMs: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    [
      ADD_TICKET_COMMENT_TOOL_KEY,
      {
        id: "def-add-comment",
        key: ADD_TICKET_COMMENT_TOOL_KEY,
        display_name: "Add Ticket Comment",
        description: "Add comment",
        category: "support",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: ["tools.execute", "tickets.comment"],
        supported_states: ["waiting_user"],
        input_schema: {
          type: "object",
          properties: { ticketId: { type: "string" }, body: { type: "string" } },
          required: ["ticketId", "body"],
        },
        output_schema: { type: "object" },
        timeout_ms: 30000,
        retry_policy: { maxAttempts: 1, backoffMs: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  ]);

  return {
    async findByKey(toolKey) {
      return definitions.get(toolKey) ?? null;
    },
    async listEnabled() {
      return [...definitions.values()];
    },
    async listAll() {
      return [...definitions.values()];
    },
    async findById() {
      return null;
    },
    async updateEnabled(input) {
      const existing = definitions.get(input.key);
      if (!existing) throw new Error("missing");
      const updated = { ...existing, is_enabled: input.isEnabled };
      definitions.set(input.key, updated);
      return updated;
    },
  };
}

function createRouter(handlers: ReturnType<typeof createToolHandlerRegistry>, key: string) {
  const definitionRepository = createDefinition(key, ["tools.execute", "tickets.create"]);
  const executionRepository: ToolExecutionRepository = {
    async create(input) {
      return {
        id: "exec-1",
        company_id: input.companyId,
        conversation_id: input.conversationId,
        tool_definition_id: input.toolDefinitionId,
        tool_key: input.toolKey,
        input: input.input,
        triggered_by: input.triggeredBy,
        status: "running",
        started_at: new Date().toISOString(),
        created_by: input.createdBy,
      };
    },
    async markRunning() {},
    async complete(input) {
      return {
        id: input.executionId,
        company_id: "company-1",
        conversation_id: "conv-1",
        tool_definition_id: "def-1",
        tool_key: key,
        input: {},
        triggered_by: "router",
        status: input.status,
        output: input.output,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        duration_ms: input.durationMs,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_by: "user-1",
      };
    },
  };

  const conversationReader: ConversationReader = {
    async findById() {
      return {
        id: "conv-1",
        company_id: "company-1",
        state: "waiting_user",
      };
    },
  };

  return new ToolRouterService(definitionRepository, executionRepository, conversationReader, handlers);
}

describe("ticket tools integration", () => {
  it("registers and exposes all ticket tools when ports are wired", () => {
    const registered = listRegisteredToolHandlerKeys({
      customerService: {} as never,
      crmAgentPorts: {} as never,
      schedulingToolPorts: {} as never,
      ticketAgentPorts: {} as never,
    });
    const exposure = resolveLlmToolExposure(registered);
    for (const key of [
      "create_ticket",
      "update_ticket",
      "close_ticket",
      "assign_ticket",
      "add_ticket_comment",
      "change_ticket_priority",
      "change_ticket_status",
      "search_ticket",
    ]) {
      assert.ok(exposure.allowedToolKeys.includes(key), `missing ${key}`);
    }
  });

  it("routes create_ticket through ToolRouterService", async () => {
    const handlers = createToolHandlerRegistry(createTicketAgentTools(createStubTicketPorts()));
    const router = createRouter(handlers, CREATE_TICKET_TOOL_KEY);
    const result = await router.route(
      {
        userId: "user-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tools.execute" || code.startsWith("tickets."),
      },
      {
        conversationId: "conv-1",
        toolKey: CREATE_TICKET_TOOL_KEY,
        input: { subject: "Payment failed", priority: "high" },
      },
    );

    assert.equal(result.status, "succeeded");
    assert.equal(result.output?.success, true);
  });

  it("denies ticket tool when RBAC permission is missing", async () => {
    const handlers = createToolHandlerRegistry(createTicketAgentTools(createStubTicketPorts()));
    const router = createRouter(handlers, CREATE_TICKET_TOOL_KEY);
    const result = await router.route(
      {
        userId: "user-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tools.execute",
      },
      {
        conversationId: "conv-1",
        toolKey: CREATE_TICKET_TOOL_KEY,
        input: { subject: "Payment failed", priority: "high" },
      },
    );

    assert.equal(result.status, "denied");
  });
});
