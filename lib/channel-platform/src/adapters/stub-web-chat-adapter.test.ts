import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChannelAdapterContext } from "../ports/channel-adapter-port.js";
import { PUBLIC_WEB_WIDGET_PROVIDER, StubWebChatAdapter } from "./stub-web-chat-adapter.js";

function ctx(provider: string): ChannelAdapterContext {
  return { companyChannel: { id: "channel-1", provider } } as unknown as ChannelAdapterContext;
}

describe("StubWebChatAdapter — public web widget", () => {
  it("never claims provider delivery for the public widget channel (visitor polls)", async () => {
    const adapter = new StubWebChatAdapter();
    const result = await adapter.sendOutbound(ctx(PUBLIC_WEB_WIDGET_PROVIDER), { text: "hi" });
    assert.equal(result.providerResponse?.delivered, false);
    assert.equal(result.providerResponse?.deliveryMode, "visitor_polling");
    assert.equal("payload" in (result.providerResponse ?? {}), false);
  });

  it("internal generic web chat behavior is unchanged", async () => {
    const adapter = new StubWebChatAdapter();
    const result = await adapter.sendOutbound(ctx("generic.web_chat"), { text: "hi" });
    assert.equal(result.providerResponse?.delivered, true);
    assert.deepEqual(result.providerResponse?.payload, { text: "hi" });
  });
});
