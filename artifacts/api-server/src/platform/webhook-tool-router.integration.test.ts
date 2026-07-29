import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRuntimeToolPort,
  listRegisteredToolHandlerKeys,
} from "@workspace/ai-tool-router";
import { createEnterpriseRuntimeIntegrations } from "@workspace/ai-execution-engine";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";
import { createChannelRuntimePort } from "./channel-platform-ports.js";
import type { RuntimeIntegrationServices } from "@workspace/runtime-integration";

const FULLY_WIRED_LLM_TOOLS = [
  "booking_search",
  "create_booking",
  "create_customer",
  "find_duplicate_customers",
  "invoice_search",
  "knowledge_search",
  "search_availability",
  "search_customer",
  "update_customer",
];

describe("api-server webhook Tool Router wiring", () => {
  it("creates runtime tool port backed by ToolRouterService", () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const { tools, toolRouterServices, createOptions } = createWebhookToolRouterIntegrations(mockClient as never);
    assert.ok(toolRouterServices.router);
    assert.deepEqual(tools.allowedToolKeys().sort(), FULLY_WIRED_LLM_TOOLS);
    assert.equal(tools.listLlmTools().length, FULLY_WIRED_LLM_TOOLS.length);
    assert.equal(listRegisteredToolHandlerKeys(createOptions).length, 17);
  });

  it("passes tools into createEnterpriseRuntimeIntegrations for webhook runtime", () => {
    const tools = createRuntimeToolPort(
      {
        router: {
          route: async () => ({
            executionId: "tool-exec-1",
            toolKey: "create_customer",
            status: "succeeded",
            output: { success: true },
            durationMs: 1,
          }),
        },
      } as never,
      {
        customerService: {} as never,
        crmAgentPorts: {} as never,
        schedulingToolPorts: {} as never,
      },
    );

    const integrations = createEnterpriseRuntimeIntegrations({
      promptRuntime: { execute: async () => ({ builtPrompt: {} }) } as never,
      gateway: { chatCompletion: async () => ({ text: "ok" }) } as never,
      tools,
    });

    assert.equal(integrations.tools, tools);
    assert.deepEqual(tools.allowedToolKeys().sort(), FULLY_WIRED_LLM_TOOLS);
  });

  it("resolves a company actor user id before runtime execution for tool-capable webhook requests", async () => {
    let capturedUserId: string | null | undefined;
    const runtimeServices = {
      coordinator: {
        execute: async (ctx: { userId?: string | null }) => {
          capturedUserId = ctx.userId;
          return {
            executionId: "runtime-1",
            responseContent: { text: "done" },
            correlationId: "corr-1",
          };
        },
      },
    } as unknown as RuntimeIntegrationServices;

    const runtimePort = createChannelRuntimePort(
      runtimeServices,
      {
        userId: null,
        companyId: null,
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        resolveRuntimeActorUserId: async () => "company-owner-1",
      },
    );

    await runtimePort.execute({
      companyId: "company-1",
      conversationId: "conv-1",
      messageText: "Create a customer",
      runtimeConfig: { providerConnectionId: "conn-1" },
    });

    assert.equal(capturedUserId, "company-owner-1");
  });
});
