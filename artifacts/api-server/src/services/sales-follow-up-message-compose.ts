/**
 * Compose unique sales follow-up messages via platform AI + anti-duplicate fallbacks.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  composeSalesFollowUpMessage,
  type SalesFollowUpJobRecord,
  type SalesFollowUpSettings,
} from "@workspace/automation-platform";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { logger } from "../lib/logger.js";

async function loadPreviousFollowUpMessages(
  client: SupabaseClient,
  companyId: string,
  leadId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("sales_follow_up_jobs")
    .select("message_text, attempt_number, status, last_outcome")
    .eq("company_id", companyId)
    .eq("lead_id", leadId)
    .order("attempt_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => {
      const text = String(row.message_text ?? "").trim();
      if (!text) return false;
      const outcome = String(row.last_outcome ?? "").toLowerCase();
      return outcome === "sent" || row.status === "completed";
    })
    .map((row) => String(row.message_text).trim());
}

async function loadOpportunityProductForLead(
  client: SupabaseClient,
  companyId: string,
  leadId: string,
): Promise<string | null> {
  // Prefer the open opportunity linked to THIS lead — never another lead's product.
  const { data: opportunities } = await client
    .from("opportunities")
    .select("id, name, won_at, lost_at")
    .eq("company_id", companyId)
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  const open = (opportunities ?? []).find((row) => !row.won_at && !row.lost_at);
  if (!open?.id) return null;

  const { data: lines } = await client
    .from("opportunity_line_items")
    .select("product_id, product_name_snapshot")
    .eq("opportunity_id", open.id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(3);
  const named = (lines ?? [])
    .map((row) => String(row.product_name_snapshot ?? "").trim())
    .filter(Boolean);
  if (named.length === 1) return named[0]!;
  if (named.length > 1) return null; // ambiguous — do not invent a single product

  const oppName = String(open.name ?? "").trim();
  return oppName || null;
}

async function loadLeadContext(
  client: SupabaseClient,
  companyId: string,
  leadId: string,
  conversationId: string | null,
): Promise<{
  customerDisplayName: string | null;
  productOrInterest: string | null;
  lastCustomerMessage: string | null;
  salesStage: string | null;
  language: string | null;
}> {
  const { data: lead } = await client
    .from("leads")
    .select("title, contact_name, lifecycle_status, stage_id, metadata, customer_id")
    .eq("company_id", companyId)
    .eq("id", leadId)
    .maybeSingle();

  let lastCustomerMessage: string | null = null;
  if (conversationId) {
    const { data: messages } = await client
      .from("conversation_messages")
      .select("content, message_type, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    const inbound = (messages ?? []).find((row) => {
      const type = String(row.message_type ?? "").toLowerCase();
      return type.includes("customer") || type.includes("inbound") || type === "user";
    });
    lastCustomerMessage = inbound ? String(inbound.content ?? "").slice(0, 500) : null;
  }

  const metadata =
    lead?.metadata && typeof lead.metadata === "object"
      ? (lead.metadata as Record<string, unknown>)
      : {};

  const opportunityProduct = await loadOpportunityProductForLead(client, companyId, leadId);
  const interest =
    opportunityProduct ||
    (typeof metadata.productName === "string" && metadata.productName) ||
    (typeof metadata.interest === "string" && metadata.interest) ||
    (typeof lead?.title === "string" && lead.title !== "Unknown Contact" ? lead.title : null);

  let customerDisplayName =
    (typeof lead?.contact_name === "string" && lead.contact_name) ||
    (typeof metadata.customerName === "string" ? metadata.customerName : null);
  if (
    lead?.customer_id &&
    (!customerDisplayName ||
      /^unknown contact$/i.test(customerDisplayName) ||
      /^(whatsapp|messenger)\b/i.test(customerDisplayName))
  ) {
    const { data: customer } = await client
      .from("customers")
      .select("name")
      .eq("company_id", companyId)
      .eq("id", lead.customer_id)
      .maybeSingle();
    if (typeof customer?.name === "string" && customer.name.trim()) {
      customerDisplayName = customer.name.trim();
    }
  }

  return {
    customerDisplayName,
    productOrInterest: interest,
    lastCustomerMessage,
    salesStage: typeof lead?.lifecycle_status === "string" ? lead.lifecycle_status : null,
    language:
      (typeof metadata.preferred_language === "string" && metadata.preferred_language) ||
      (typeof metadata.language === "string" ? metadata.language : null),
  };
}

export function createSalesFollowUpMessageResolver(client: SupabaseClient) {
  return async (job: SalesFollowUpJobRecord, settings: SalesFollowUpSettings): Promise<string> => {
    const previous = await loadPreviousFollowUpMessages(client, job.companyId, job.leadId);
    const ctx = await loadLeadContext(client, job.companyId, job.leadId, job.conversationId);

    let aiPort: {
      complete: (input: {
        system: string;
        user: string;
        temperature?: number;
        maxTokens?: number;
      }) => Promise<{ text: string }>;
    } | null = null;

    try {
      const platform = createPlatformAIProviderServices(client);
      const providers = createAIProviderServices(client);
      const runtime = await platform.platform.resolveRuntimeConfig(job.companyId, "openai", "chat");
      aiPort = {
        async complete(input) {
          const response = await providers.gateway.chatCompletion({
            providerKey: runtime.providerKey,
            model: runtime.model,
            temperature: input.temperature ?? 0.7,
            maxTokens: input.maxTokens ?? 280,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.user },
            ],
            context: {
              companyId: job.companyId,
              userId: null,
              conversationId: job.conversationId ?? undefined,
              executionId: `sales-follow-up:${job.id}:${job.attemptNumber}`,
            },
          });
          return { text: String(response.text ?? "").trim() };
        },
      };
    } catch (error) {
      logger.info(
        {
          event: "sales.follow_up.message.ai_unavailable",
          companyId: job.companyId,
          leadId: job.leadId,
          err: error instanceof Error ? error.message : String(error),
        },
        "Sales follow-up AI unavailable — using fallback templates",
      );
      aiPort = null;
    }

    const composed = await composeSalesFollowUpMessage({
      context: {
        companyId: job.companyId,
        customerDisplayName: ctx.customerDisplayName,
        productOrInterest: ctx.productOrInterest,
        lastCustomerMessage: ctx.lastCustomerMessage,
        salesStage: ctx.salesStage,
        openQuestions: [],
        channel: job.channel ?? settings.channels[0] ?? "whatsapp",
        language: ctx.language,
        attemptNumber: job.attemptNumber,
        maxAttempts: settings.maxAttempts,
        previousFollowUpMessages: previous,
        goalHint:
          job.attemptNumber <= 1
            ? "gentle check-in after silence"
            : "add a new helpful reason without repeating prior follow-ups",
      },
      ai: aiPort,
    });

    logger.info(
      {
        event: "sales.follow_up.message.composed",
        companyId: job.companyId,
        leadId: job.leadId,
        attemptNumber: job.attemptNumber,
        source: composed.source,
        rejectedDuplicates: composed.rejectedDuplicates,
        length: composed.text.length,
      },
      "Sales follow-up message composed",
    );

    return composed.text;
  };
}
