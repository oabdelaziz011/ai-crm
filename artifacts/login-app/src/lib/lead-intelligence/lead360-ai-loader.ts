import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadIntelligenceResult } from "@workspace/lead-platform";
import type {
  Lead360AiMemoryFactDto,
  Lead360AiPanelDto,
  Lead360AiSuggestionDto,
} from "./lead360-ai-types.js";

function asIntelligence(raw: unknown): LeadIntelligenceResult | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as LeadIntelligenceResult;
}

/** Loads AI intelligence panel data — reuses existing tables, no duplicate caches. */
export async function loadLead360AiPanel(
  client: SupabaseClient,
  companyId: string,
  leadId: string,
): Promise<Lead360AiPanelDto> {
  const [{ data: leadRow }, { data: suggestions }, { data: memory }] = await Promise.all([
    client
      .from("leads")
      .select("metadata")
      .eq("id", leadId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("lead_ai_suggestions")
      .select("id, field_key, proposed_value, current_value, confidence, status, reason, created_at")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("lead_ai_memory")
      .select("fact_key, fact_value, confidence, source, updated_at")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  const metadata = (leadRow?.metadata ?? {}) as Record<string, unknown>;
  const intelligence = asIntelligence(metadata.aiIntelligence);

  return {
    intelligence,
    suggestions: (suggestions ?? []).map(
      (row): Lead360AiSuggestionDto => ({
        id: String(row.id),
        fieldKey: String(row.field_key),
        proposedValue: row.proposed_value,
        currentValue: row.current_value,
        confidence: Number(row.confidence ?? 0),
        status: String(row.status),
        reason: String(row.reason ?? ""),
        createdAt: String(row.created_at),
      }),
    ),
    memory: (memory ?? []).map(
      (row): Lead360AiMemoryFactDto => ({
        factKey: String(row.fact_key),
        factValue: String(row.fact_value),
        confidence: Number(row.confidence ?? 0),
        source: String(row.source ?? ""),
        updatedAt: String(row.updated_at),
      }),
    ),
  };
}

export async function resolveLeadAiSuggestion(
  client: SupabaseClient,
  input: {
    companyId: string;
    suggestionId: string;
    status: "accepted" | "rejected" | "edited";
    reviewerUserId: string;
    editedValue?: unknown;
  },
): Promise<void> {
  const { data: row, error } = await client
    .from("lead_ai_suggestions")
    .select("*")
    .eq("id", input.suggestionId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Suggestion not found");

  const { error: updErr } = await client
    .from("lead_ai_suggestions")
    .update({
      status: input.status,
      reviewer_user_id: input.reviewerUserId,
      resolved_at: new Date().toISOString(),
      proposed_value:
        input.status === "edited" && input.editedValue !== undefined
          ? input.editedValue
          : row.proposed_value,
    })
    .eq("id", input.suggestionId)
    .eq("company_id", input.companyId);
  if (updErr) throw new Error(updErr.message);

  if (input.status === "accepted" || input.status === "edited") {
    const fieldKey = String(row.field_key);
    const value =
      input.status === "edited" && input.editedValue !== undefined
        ? input.editedValue
        : row.proposed_value;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fieldKey === "companyName" || fieldKey === "company_name") {
      patch.company_name = typeof value === "object" && value && "value" in (value as object)
        ? String((value as { value: unknown }).value ?? "")
        : String(value ?? "");
    } else if (fieldKey === "contactName" || fieldKey === "contact_name") {
      patch.contact_name = typeof value === "object" && value && "value" in (value as object)
        ? String((value as { value: unknown }).value ?? "")
        : String(value ?? "");
    } else if (fieldKey === "title") {
      patch.title = typeof value === "object" && value && "value" in (value as object)
        ? String((value as { value: unknown }).value ?? "")
        : String(value ?? "");
    }
    if (Object.keys(patch).length > 1) {
      const { error: leadErr } = await client
        .from("leads")
        .update(patch)
        .eq("id", row.lead_id)
        .eq("company_id", input.companyId);
      if (leadErr) throw new Error(leadErr.message);
    }
  }
}
