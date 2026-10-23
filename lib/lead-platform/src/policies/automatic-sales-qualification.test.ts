import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  conversationIsPublicWebWidget,
  PUBLIC_WEB_WIDGET_PROVIDER,
  qualifyOpenLeadFromCustomerTurn,
} from "./automatic-sales-qualification.js";

function clientFor(input: {
  conversation: Record<string, unknown> | null;
  channel: Record<string, unknown> | null;
  conversationError?: string;
}): { client: SupabaseClient; filters: string[] } {
  const filters: string[] = [];
  const client = {
    from(table: string) {
      const filtersForRow: Array<[string, string]> = [];
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: string) {
          filtersForRow.push([column, value]);
          filters.push(`${table}.${column}=${value}`);
          return chain;
        },
        async maybeSingle() {
          if (table === "conversations") {
            if (input.conversationError) return { data: null, error: { message: input.conversationError } };
            return { data: input.conversation, error: null };
          }
          return { data: input.channel, error: null };
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, filters };
}

describe("public web chat qualification identity", () => {
  it("treats only the company-scoped widget provider as public", async () => {
    const widget = clientFor({
      conversation: { channel_type: "web_chat", company_channel_id: "channel-1" },
      channel: { provider: PUBLIC_WEB_WIDGET_PROVIDER },
    });
    assert.equal(await conversationIsPublicWebWidget(widget.client, "company-1", "conv-1"), true);
    assert.equal(widget.filters.includes("conversations.company_id=company-1"), true);
    assert.equal(widget.filters.includes("company_channels.company_id=company-1"), true);

    const otherProvider = clientFor({
      conversation: { channel_type: "web_chat", company_channel_id: "channel-1" },
      channel: { provider: "whatsapp" },
    });
    assert.equal(await conversationIsPublicWebWidget(otherProvider.client, "company-1", "conv-1"), false);

    const missingFlagStillBlocks = await qualifyOpenLeadFromCustomerTurn({
      companyId: "company-1",
      conversationId: "conv-1",
      messageText: "Ich möchte Aurora Studio kaufen",
      actorUserId: "user-1",
      pageContext: {},
      publicWebChatConversation: true,
      gateAllowsAutomatedReply: true,
      loadCustomerTexts: async () => [],
      findLeadId: async () => "lead-1",
      apply: async () => {
        throw new Error("public chat must not qualify");
      },
    });
    assert.equal(missingFlagStillBlocks, "skipped");
  });

  it("fails closed when the channel lookup errors", async () => {
    const broken = clientFor({
      conversation: null,
      channel: null,
      conversationError: "db down",
    });
    await assert.rejects(() => conversationIsPublicWebWidget(broken.client, "company-1", "conv-1"), /db down/);
  });
});
