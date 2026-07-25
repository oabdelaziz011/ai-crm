import assert from "node:assert/strict";
import { resolveInboxConversationId } from "../runtime/resolve-inbox-conversation-id.js";

assert.equal(resolveInboxConversationId({ conversationId: "abc" }), "abc");
assert.equal(resolveInboxConversationId({ conversation: { id: "def" } }), "def");
assert.equal(resolveInboxConversationId({ conversationId: " abc ", conversation: { id: "def" } }), "abc");
assert.equal(resolveInboxConversationId({}), null);

console.log("resolve-inbox-conversation-id.test.ts: all assertions passed");
