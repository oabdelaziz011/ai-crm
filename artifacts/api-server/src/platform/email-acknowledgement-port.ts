/**
 * Loads acknowledgement branding from companies.branding and claims outbound rows.
 * Storage SoT: companies.branding.email.acknowledgement (no parallel store).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAcknowledgementClaimExternalId,
  normalizeEmailAcknowledgementConfig,
  renderEmailSignatureHtml,
  type EmailAcknowledgementPorts,
} from "@workspace/channel-platform";
import type { ChannelConversationPort } from "@workspace/channel-platform";

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveEmailLogoUrl(logos: Record<string, unknown>): string | null {
  const email = typeof logos.email === "string" ? logos.email.trim() : "";
  const main = typeof logos.main === "string" ? logos.main.trim() : "";
  return email || main || null;
}

export function createEmailAcknowledgementPorts(
  client: SupabaseClient,
  conversation: ChannelConversationPort,
): EmailAcknowledgementPorts {
  return {
    async loadBranding(companyId) {
      const { data, error } = await client
        .from("companies")
        .select("branding")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      const branding = readRecord(data?.branding);
      const email = readRecord(branding.email);
      const logos = readRecord(branding.logos);
      return {
        acknowledgement: normalizeEmailAcknowledgementConfig(email.acknowledgement),
        signatureHtml: renderEmailSignatureHtml(email.signature),
        logoUrl: resolveEmailLogoUrl(logos),
        showLegalFooter: email.showLegalFooter === true,
        legalText: typeof email.legalText === "string" ? email.legalText : "",
      };
    },

    async findExistingAcknowledgement(input) {
      const claimId = buildAcknowledgementClaimExternalId(input.inboundMessageId);

      const { data: byClaim, error: claimError } = await client
        .from("conversation_messages")
        .select("id, status, metadata, conversation_id")
        .eq("conversation_id", input.conversationId)
        .eq("message_type", "outgoing")
        .eq("external_message_id", claimId)
        .maybeSingle();
      if (claimError) throw claimError;

      let row = byClaim as {
        id: string;
        status: string;
        metadata: Record<string, unknown> | null;
      } | null;

      if (!row) {
        const { data: byMeta, error: metaError } = await client
          .from("conversation_messages")
          .select("id, status, metadata, conversation_id")
          .eq("conversation_id", input.conversationId)
          .eq("message_type", "outgoing")
          .contains("metadata", {
            emailAutomation: { sourceInboundMessageId: input.inboundMessageId },
          })
          .limit(1)
          .maybeSingle();
        if (metaError) throw metaError;
        row = byMeta as typeof row;
      }

      if (!row) return null;

      // Company isolation: verify conversation belongs to companyId.
      const { data: conversationRow, error: convError } = await client
        .from("conversations")
        .select("id")
        .eq("id", input.conversationId)
        .eq("company_id", input.companyId)
        .maybeSingle();
      if (convError) throw convError;
      if (!conversationRow) return null;

      const metadata = readRecord(row.metadata);
      return {
        id: row.id,
        status: String(row.status ?? "pending"),
        dispatchConfirmed: metadata.dispatchConfirmed === true,
        dispatchFailed: metadata.dispatchFailed === true || String(row.status) === "failed",
      };
    },

    async claimOutgoingAcknowledgement(input) {
      const result = await conversation.addOutgoingMessage({
        conversationId: input.conversationId,
        content: input.content,
        metadata: input.metadata,
        externalMessageId: input.externalMessageId,
      });
      return { id: result.id, reused: Boolean(result.reused) };
    },
  };
}
