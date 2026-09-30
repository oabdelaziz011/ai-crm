import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSupabaseConversationRepository } from "./supabase-conversation-repository.js";
import { buildPublicWebChatChannelScopeOr } from "./public-web-chat-list-scope.js";

type Call = [string, ...unknown[]];

function fakeClient() {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "in", "or", "gt", "ilike", "limit", "range"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 });
  return { client: { from: () => builder } as never, calls };
}

describe("public web chat list scope", () => {
  it("ORs widget rows into the allowlist and drops bare web_chat", () => {
    assert.equal(
      buildPublicWebChatChannelScopeOr(["whatsapp", "sms", "web_chat"]),
      "channel_type.in.(whatsapp,sms),and(channel_type.eq.web_chat,metadata->>publicWebChat.eq.true,metadata->>channelProvider.eq.valueor.web_widget)",
    );
    assert.equal(
      buildPublicWebChatChannelScopeOr(["web_chat"]),
      "and(channel_type.eq.web_chat,metadata->>publicWebChat.eq.true,metadata->>channelProvider.eq.valueor.web_widget)",
    );
  });

  it("repository keeps the plain IN allowlist when public web chat is not requested", async () => {
    const { client, calls } = fakeClient();
    await createSupabaseConversationRepository(client).list({
      companyId: "c1",
      channelTypes: ["whatsapp", "messenger", "instagram", "sms"],
    });
    assert.deepEqual(calls.find((c) => c[0] === "in"), ["in", "channel_type", ["whatsapp", "messenger", "instagram", "sms"]]);
    assert.equal(calls.some((c) => c[0] === "or"), false);
  });

  it("repository ORs the widget scope and still applies the visibility OR separately", async () => {
    const { client, calls } = fakeClient();
    await createSupabaseConversationRepository(client).list({
      companyId: "c1",
      channelTypes: ["whatsapp", "messenger", "instagram", "sms"],
      includePublicWebChat: true,
      visibilityConstraint: { userId: "u1", departmentId: null, managedDepartmentIds: [] },
    });
    const ors = calls.filter((c) => c[0] === "or").map((c) => c[1]);
    assert.deepEqual(ors, [
      buildPublicWebChatChannelScopeOr(["whatsapp", "messenger", "instagram", "sms"]),
      "assigned_user_id.eq.u1",
    ]);
    assert.equal(calls.some((c) => c[0] === "in"), false);
    assert.deepEqual(calls.find((c) => c[0] === "eq" && c[1] === "company_id"), ["eq", "company_id", "c1"]);
  });

  it("web_chat chip narrows to widget rows only when public web chat is requested", async () => {
    const narrowed = fakeClient();
    await createSupabaseConversationRepository(narrowed.client).list({
      companyId: "c1",
      channelType: "web_chat",
      includePublicWebChat: true,
    });
    const eqs = narrowed.calls.filter((c) => c[0] === "eq").map((c) => [c[1], c[2]]);
    assert.deepEqual(eqs.slice(-3), [
      ["channel_type", "web_chat"],
      ["metadata->>publicWebChat", "true"],
      ["metadata->>channelProvider", "valueor.web_widget"],
    ]);

    const legacy = fakeClient();
    await createSupabaseConversationRepository(legacy.client).list({ companyId: "c1", channelType: "web_chat" });
    assert.equal(legacy.calls.some((c) => c[0] === "eq" && c[1] === "metadata->>publicWebChat"), false);
  });
});
