import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";
import type { JsonSchema } from "../types.js";

type MockToolOptions = {
  key: string;
  supportedStates: ConversationState[];
  inputSchema: JsonSchema;
  mockOutput: (context: ToolExecutionContext, input: Record<string, unknown>) => Record<string, unknown>;
};

function createMockTool(options: MockToolOptions): Tool {
  return {
    supports(state: ConversationState) {
      return options.supportedStates.includes(state);
    },
    validate(input: Record<string, unknown>) {
      validateAgainstSchema(options.inputSchema, input);
    },
    async execute(context, input) {
      return options.mockOutput(context, input);
    },
  };
}

export function createBuiltinTools(): Record<string, Tool> {
  return {
    knowledge_lookup: createMockTool({
      key: "knowledge_lookup",
      supportedStates: ["greeting", "collecting_information", "waiting_user", "waiting_api"],
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      mockOutput(_context, input) {
        return {
          results: [
            {
              id: "kb-mock-1",
              title: "Mock knowledge article",
              snippet: `Placeholder result for "${String(input.query)}"`,
              score: 0.92,
            },
          ],
        };
      },
    }),
    crm_lookup: createMockTool({
      key: "crm_lookup",
      supportedStates: [
        "collecting_information",
        "waiting_user",
        "waiting_api",
        "transferred_to_human",
      ],
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      mockOutput(_context, input) {
        return {
          records: [
            {
              id: "crm-mock-1",
              name: "Mock CRM Contact",
              query: String(input.query),
            },
          ],
        };
      },
    }),
    customer_profile: createMockTool({
      key: "customer_profile",
      supportedStates: [
        "greeting",
        "collecting_information",
        "waiting_user",
        "waiting_api",
        "transferred_to_human",
      ],
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
      mockOutput(_context, input) {
        return {
          profile: {
            id: String(input.customerId),
            name: "Mock Customer",
            tier: "standard",
            lastSeenAt: new Date().toISOString(),
          },
        };
      },
    }),
    appointment_lookup: createMockTool({
      key: "appointment_lookup",
      supportedStates: ["collecting_information", "waiting_user", "waiting_api"],
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
        },
      },
      mockOutput(_context, input) {
        return {
          appointments: [
            {
              id: "appt-mock-1",
              customerId: input.customerId ?? null,
              startsAt: input.from ?? new Date().toISOString(),
              status: "confirmed",
            },
          ],
        };
      },
    }),
    booking: createMockTool({
      key: "booking",
      supportedStates: ["collecting_information", "waiting_api"],
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string" },
          slot: { type: "string" },
        },
        required: ["service", "slot"],
      },
      mockOutput(_context, input) {
        return {
          bookingId: "booking-mock-1",
          status: "reserved",
          service: String(input.service),
          slot: String(input.slot),
        };
      },
    }),
    faq: createMockTool({
      key: "faq",
      supportedStates: ["greeting", "waiting_user", "waiting_api"],
      inputSchema: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"],
      },
      mockOutput(_context, input) {
        return {
          answer: `Mock FAQ answer for: ${String(input.question)}`,
        };
      },
    }),
    notification: createMockTool({
      key: "notification",
      supportedStates: ["waiting_api", "transferred_to_human"],
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
          severity: { type: "string" },
        },
        required: ["message"],
      },
      mockOutput(_context, input) {
        return {
          delivered: true,
          message: String(input.message),
          severity: input.severity ?? "info",
        };
      },
    }),
    escalation: createMockTool({
      key: "escalation",
      supportedStates: ["greeting", "collecting_information", "waiting_user", "waiting_api"],
      inputSchema: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
      mockOutput(_context, input) {
        return {
          escalated: true,
          reason: String(input.reason),
          queue: "human-support",
        };
      },
    }),
  };
}
