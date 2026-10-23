import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeToolPort, RuntimeToolRouteInput, ServiceContext } from "@workspace/ai-execution-engine";
import type { ChannelEmployeeRuntimePort } from "@workspace/channel-platform";
import {
  AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY,
  readAgentEmployeeExecutionContext,
  resolveActiveToolScope,
} from "../../platform/employee-runtime-bridge.js";
import {
  PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS,
  PUBLIC_WEB_CHAT_TOOL_DENIED_CODE,
  createPublicWebChatToolGuard,
  filterPublicWebChatToolKeys,
  restrictPageContextToPublicWebChat,
  withPublicWebChatEmployeeToolPolicy,
} from "./public-web-chat-tool-policy.js";

const UNSAFE_TOOLS = [
  "search_customers",
  "get_customer",
  "update_customer",
  "merge_customers",
  "import_customers",
  "create_customer",
  "create_lead",
  "search_leads",
  "get_invoice",
  "search_invoices",
  "get_ticket",
  "search_tickets",
  "get_booking",
  "crm_lookup",
  "internal_search",
  "transfer_workflow",
  "search_products",
  "get_product_details",
  "create_draft_quote",
  "request_send_quote",
  "qualify_lead",
  "list_demo_types",
  "search_demo_availability",
  "find_next_demo",
  "create_demo_booking",
];

const ctx = {} as ServiceContext;

function createBaseToolPort() {
  const routed: string[] = [];
  const port: RuntimeToolPort = {
    allowedToolKeys: () => [...UNSAFE_TOOLS, ...PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS],
    listLlmTools: () => [],
    async route(_ctx, input: RuntimeToolRouteInput) {
      routed.push(input.toolKey);
      return { executionId: "x", toolKey: input.toolKey, status: "completed", output: {}, durationMs: 1 };
    },
  };
  return { port, routed };
}

const resolver = {
  async isPublicWebChatConversation(id: string) {
    if (id === "broken") throw new Error("db down");
    return id.startsWith("public-");
  },
  async isPublicWebChatChannel(id: string) {
    return id === "widget-channel";
  },
};

function executionContext(allowedToolKeys: string[]) {
  return Object.freeze({
    aiEmployeeId: "employee-1",
    allowedToolKeys: Object.freeze([...allowedToolKeys]),
    employeeRuntime: {},
    providerConnectionId: "provider-1",
    executionPolicy: {},
    knowledgeRetrieval: null,
    pageContext: {},
  });
}

describe("29. Public Web Chat tool policy", () => {
  it("allowlist contains no customer/CRM/record/import/merge/update tools", () => {
    for (const tool of UNSAFE_TOOLS) {
      assert.equal((PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS as readonly string[]).includes(tool), false, tool);
    }
    assert.deepEqual(filterPublicWebChatToolKeys([...UNSAFE_TOOLS, "knowledge_search"]), ["knowledge_search"]);
  });

  it("route-time guard blocks unsafe tools on public web chat conversations", async () => {
    const { port, routed } = createBaseToolPort();
    const guarded = createPublicWebChatToolGuard(port, resolver);
    for (const toolKey of UNSAFE_TOOLS) {
      const result = await guarded.route(ctx, {
        conversationId: "public-1",
        toolKey,
        input: { query: "someone else" },
        triggeredBy: "ai",
      } as RuntimeToolRouteInput);
      assert.equal(result.status, "failed", toolKey);
      assert.equal(result.errorCode, PUBLIC_WEB_CHAT_TOOL_DENIED_CODE);
    }
    assert.deepEqual(routed, []);
    const allowed = await guarded.route(ctx, {
      conversationId: "public-1",
      toolKey: "knowledge_search",
      input: {},
      triggeredBy: "ai",
    } as RuntimeToolRouteInput);
    assert.equal(allowed.status, "completed");
  });

  it("other channels (WhatsApp, internal AI chat, email) are unaffected", async () => {
    const { port, routed } = createBaseToolPort();
    const guarded = createPublicWebChatToolGuard(port, resolver);
    const result = await guarded.route(ctx, {
      conversationId: "whatsapp-1",
      toolKey: "search_customers",
      input: {},
      triggeredBy: "ai",
    } as RuntimeToolRouteInput);
    assert.equal(result.status, "completed");
    assert.deepEqual(routed, ["search_customers"]);
  });

  it("classification failure fails closed", async () => {
    const { port, routed } = createBaseToolPort();
    const guarded = createPublicWebChatToolGuard(port, resolver);
    const result = await guarded.route(ctx, {
      conversationId: "broken",
      toolKey: "knowledge_search",
      input: {},
      triggeredBy: "ai",
    } as RuntimeToolRouteInput);
    assert.equal(result.status, "failed");
    assert.deepEqual(routed, []);
  });

  it("page context + frozen employee execution context are narrowed to the allowlist", () => {
    const narrowed = restrictPageContextToPublicWebChat({
      allowedToolKeys: ["search_customers", "knowledge_search"],
      [AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]: executionContext(["update_customer", "escalate_to_human"]),
    });
    assert.equal(narrowed.publicWebChat, true);
    assert.deepEqual(narrowed.allowedToolKeys, ["knowledge_search"]);
    assert.deepEqual(readAgentEmployeeExecutionContext(narrowed)?.allowedToolKeys, ["escalate_to_human"]);
  });

  it("employee runtime policy narrows only for the widget channel and re-registers the conversation scope", async () => {
    const base: ChannelEmployeeRuntimePort = {
      async prepareForConversation() {
        return {
          employeeId: "employee-1",
          runtimeConfig: {
            providerConnectionId: "provider-1",
            pageContext: {
              allowedToolKeys: ["search_customers", "knowledge_search"],
              [AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]: executionContext(["search_customers", "knowledge_search"]),
            },
          },
        };
      },
    } as unknown as ChannelEmployeeRuntimePort;
    const wrapped = withPublicWebChatEmployeeToolPolicy(base, resolver);

    const publicPrepared = await wrapped.prepareForConversation({
      conversationId: "public-conv-1",
      basePageContext: { companyChannelId: "widget-channel" },
    } as never);
    assert.deepEqual(publicPrepared?.runtimeConfig.pageContext?.allowedToolKeys, ["knowledge_search"]);
    assert.deepEqual(resolveActiveToolScope("public-conv-1")?.allowedToolKeys, ["knowledge_search"]);
    assert.equal(resolveActiveToolScope("public-conv-1")?.showProductPrices, false);

    const otherPrepared = await wrapped.prepareForConversation({
      conversationId: "wa-conv-1",
      basePageContext: { companyChannelId: "whatsapp-channel" },
    } as never);
    assert.deepEqual(otherPrepared?.runtimeConfig.pageContext?.allowedToolKeys, [
      "search_customers",
      "knowledge_search",
    ]);
  });

  it("configuration lookup failure still denies sales, quote, and product-demo tools", async () => {
    const failingResolver = {
      async isPublicWebChatConversation() {
        throw new Error("configuration lookup failed");
      },
      async isPublicWebChatChannel() {
        throw new Error("configuration lookup failed");
      },
    };
    const { port, routed } = createBaseToolPort();
    const guarded = createPublicWebChatToolGuard(port, failingResolver);
    for (const toolKey of ["qualify_lead", "create_customer", "create_draft_quote", "create_demo_booking"]) {
      const result = await guarded.route(ctx, {
        conversationId: "public-lookup-failed",
        toolKey,
        input: {},
        triggeredBy: "ai",
      } as RuntimeToolRouteInput);
      assert.equal(result.status, "failed", toolKey);
      assert.equal(result.errorCode, PUBLIC_WEB_CHAT_TOOL_DENIED_CODE);
    }
    assert.deepEqual(routed, []);

    const base: ChannelEmployeeRuntimePort = {
      async prepareForConversation() {
        return {
          employeeId: "employee-1",
          runtimeConfig: {
            providerConnectionId: "provider-1",
            pageContext: {
              allowedToolKeys: [
                "qualify_lead",
                "create_customer",
                "create_draft_quote",
                "list_demo_types",
                "create_demo_booking",
                "knowledge_search",
              ],
              [AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]: executionContext([
                "qualify_lead",
                "create_customer",
                "create_draft_quote",
                "list_demo_types",
                "create_demo_booking",
                "knowledge_search",
              ]),
            },
          },
        };
      },
    } as unknown as ChannelEmployeeRuntimePort;
    const wrapped = withPublicWebChatEmployeeToolPolicy(base, failingResolver);
    const prepared = await wrapped.prepareForConversation({
      conversationId: "public-lookup-failed",
      basePageContext: { companyChannelId: "widget-channel" },
    } as never);
    assert.deepEqual(prepared?.runtimeConfig.pageContext?.allowedToolKeys, ["knowledge_search"]);
    assert.deepEqual(readAgentEmployeeExecutionContext(prepared?.runtimeConfig.pageContext)?.allowedToolKeys, [
      "knowledge_search",
    ]);
  });
});
