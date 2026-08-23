import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallLoopService } from "@workspace/ai-execution-engine";
import type { RuntimeGatewayPort, RuntimeToolPort } from "@workspace/ai-execution-engine";
import {
  ADD_TICKET_COMMENT_TOOL_KEY,
  ASSIGN_TICKET_TOOL_KEY,
  CLOSE_TICKET_TOOL_KEY,
  CREATE_TICKET_TOOL_KEY,
  TICKET_TOOL_KEYS,
} from "./tools/ticket-tool-definitions.js";
import { createTicketAgentTools } from "./tools/ticket-agent-tools.js";
import type { TicketAgentToolPorts } from "./tools/ticket-agent-ports.js";

function createRecordingToolPort(onRoute: (input: Record<string, unknown>) => void): RuntimeToolPort {
  const handlers = createTicketAgentTools(createE2ETicketPorts());

  return {
    async route(_ctx, input) {
      onRoute(input as Record<string, unknown>);
      const tool = handlers[input.toolKey];
      if (!tool) {
        return {
          executionId: "missing",
          toolKey: input.toolKey,
          status: "failed",
          output: { success: false },
          durationMs: 0,
          errorCode: "TOOL_NOT_FOUND",
          errorMessage: "missing handler",
        };
      }

      const output = await tool.execute(
        {
          companyId: "company-1",
          conversationId: input.conversationId,
          conversationState: "waiting_user",
          userId: "agent-1",
          trustedCustomerId: "customer-e2e",
        },
        input.input,
      );

      return {
        executionId: `exec-${input.toolKey}`,
        toolKey: input.toolKey,
        status: "succeeded",
        output,
        durationMs: 3,
      };
    },
    listLlmTools() {
      return TICKET_TOOL_KEYS.map((name) => ({
        type: "function" as const,
        function: { name, description: name, parameters: { type: "object", properties: {} } },
      }));
    },
    allowedToolKeys() {
      return [...TICKET_TOOL_KEYS];
    },
  };
}

function createE2ETicketPorts(): TicketAgentToolPorts {
  let lastTicketId = "ticket-e2e-1";
  return {
    async getTicket(input) {
      return {
        ticket: {
          id: input.ticketId,
          ticketNumber: "TKT-000099",
          subject: "E2E",
          description: "",
          status: "open",
          priority: "normal",
          customerId: "customer-e2e",
          conversationId: "conv-e2e",
          assignedUserId: null,
          assignedUserName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
        },
      };
    },
    async createTicket(input) {
      lastTicketId = "ticket-e2e-1";
      return {
        ticket: {
          id: lastTicketId,
          ticketNumber: "TKT-000099",
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
          ticketNumber: "TKT-000099",
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
          ticketNumber: "TKT-000099",
          subject: "Closed",
          description: "",
          status: "closed",
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
          ticketNumber: "TKT-000099",
          subject: "Assigned",
          description: "",
          status: "in_progress",
          priority: "normal",
          customerId: null,
          conversationId: null,
          assignedUserId: "agent-ahmed",
          assignedUserName: input.assigneeName ?? "Ahmed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
        },
      };
    },
    async addTicketComment(input) {
      return { commentId: "comment-e2e-1", ticketId: input.ticketId };
    },
    async changeTicketPriority(input) {
      return {
        ticket: {
          id: input.ticketId,
          ticketNumber: "TKT-000099",
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
          ticketNumber: "TKT-000099",
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

function createScenarioGateway(
  steps: Array<{ tool?: string; args?: Record<string, unknown>; finalText?: string }>,
): RuntimeGatewayPort {
  let callCount = 0;
  return {
    async chatCompletion() {
      callCount += 1;
      const step = steps[callCount - 1];
      if (!step) {
        return {
          text: "Done.",
          model: "gpt-test",
          providerKey: "openai",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      }

      if (step.tool) {
        return {
          text: "",
          model: "gpt-test",
          providerKey: "openai",
          finishReason: "tool_calls",
          usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
          latencyMs: 1,
          toolCalls: [{ id: `call-${callCount}`, name: step.tool, arguments: step.args ?? {} }],
        };
      }

      return {
        text: step.finalText ?? "Done.",
        model: "gpt-test",
        providerKey: "openai",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      };
    },
  };
}

describe("ticket tools e2e", () => {
  it("creates a high priority ticket via tool loop", async () => {
    const routed: string[] = [];
    const tools = createRecordingToolPort((input) => routed.push(String(input.toolKey)));
    const gateway = createScenarioGateway([
      { tool: CREATE_TICKET_TOOL_KEY, args: { subject: "Payment failed", priority: "high" } },
      { finalText: "Ticket created." },
    ]);
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run(createLoopInput(tools, "Create a high priority ticket."));
    assert.deepEqual(routed, [CREATE_TICKET_TOOL_KEY]);
  });

  it("assigns ticket to Ahmed via tool loop", async () => {
    const routed: string[] = [];
    const tools = createRecordingToolPort((input) => routed.push(String(input.toolKey)));
    const gateway = createScenarioGateway([
      { tool: ASSIGN_TICKET_TOOL_KEY, args: { ticketId: "ticket-e2e-1", assigneeName: "Ahmed" } },
      { finalText: "Assigned." },
    ]);
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run(createLoopInput(tools, "Assign ticket to Ahmed."));
    assert.deepEqual(routed, [ASSIGN_TICKET_TOOL_KEY]);
  });

  it("closes ticket via tool loop", async () => {
    const routed: string[] = [];
    const tools = createRecordingToolPort((input) => routed.push(String(input.toolKey)));
    const gateway = createScenarioGateway([
      { tool: CLOSE_TICKET_TOOL_KEY, args: { ticketId: "ticket-e2e-1" } },
      { finalText: "Ticket closed." },
    ]);
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run(createLoopInput(tools, "Close ticket."));
    assert.deepEqual(routed, [CLOSE_TICKET_TOOL_KEY]);
    assert.match(result.response.text, /closed/i);
  });

  it("adds internal note via tool loop", async () => {
    const routed: string[] = [];
    const tools = createRecordingToolPort((input) => routed.push(String(input.toolKey)));
    const gateway = createScenarioGateway([
      {
        tool: ADD_TICKET_COMMENT_TOOL_KEY,
        args: { ticketId: "ticket-e2e-1", body: "Internal note", isInternal: true },
      },
      { finalText: "Note added." },
    ]);
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run(createLoopInput(tools, "Add internal note."));
    assert.deepEqual(routed, [ADD_TICKET_COMMENT_TOOL_KEY]);
  });
});

function createLoopInput(tools: RuntimeToolPort, content: string) {
  return {
    ctx: {
      userId: "agent-1",
      companyId: "company-1",
      isSuperAdmin: true,
      hasPermission: () => true,
    },
    conversationId: "conv-e2e",
    gatewayRequest: {
      messages: [{ role: "user" as const, content }],
      providerKey: "openai",
      model: "gpt-test",
      context: { companyId: "company-1", conversationId: "conv-e2e" },
    },
    tools: tools.listLlmTools(),
    allowedToolKeys: tools.allowedToolKeys(),
  };
}
