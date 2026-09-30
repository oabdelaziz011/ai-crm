import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInternalAiWebChatConversation,
  isPublicWebChatConversation,
} from "./public-web-chat-conversation";

const publicMetadata = { publicWebChat: true, channelProvider: "valueor.web_widget" };

describe("public vs internal web_chat conversation classification", () => {
  it("public widget conversations are identified by server-stamped provider metadata", () => {
    assert.equal(isPublicWebChatConversation({ channel_type: "web_chat", metadata: publicMetadata }), true);
    assert.equal(isPublicWebChatConversation({ channel: "web_chat", source: { metadata: publicMetadata } }), true);
    assert.equal(isInternalAiWebChatConversation({ channel_type: "web_chat", metadata: publicMetadata }), false);
  });

  it("internal AI chat (generic.web_chat) never classifies as public", () => {
    for (const metadata of [
      {},
      null,
      { channelProvider: "generic.web_chat" },
      { publicWebChat: true },
      { publicWebChat: "true", channelProvider: "valueor.web_widget" },
    ]) {
      assert.equal(isPublicWebChatConversation({ channel_type: "web_chat", metadata }), false);
      assert.equal(isInternalAiWebChatConversation({ channel_type: "web_chat", metadata }), true);
    }
  });

  it("other channels are neither", () => {
    assert.equal(isPublicWebChatConversation({ channel_type: "whatsapp", metadata: publicMetadata }), false);
    assert.equal(isInternalAiWebChatConversation({ channel_type: "whatsapp", metadata: {} }), false);
  });
});
