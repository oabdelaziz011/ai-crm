import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRecord, OpportunityStageKey } from "@workspace/opportunity-platform";
import { toOpportunity } from "@workspace/opportunity-platform";
import type { OpportunityReadModel } from "@workspace/application-layer";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";

export async function loadLeadLifecycleById(
  client: SupabaseClient,
  tenantId: string,
  leadIds: Array<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const unique = [...new Set(leadIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string | null>();
  if (!unique.length) return map;
  const { data, error } = await client
    .from("leads")
    .select("id, lifecycle_status")
    .eq("company_id", tenantId)
    .in("id", unique)
    .is("deleted_at", null);
  if (error) throw error;
  for (const row of data ?? []) {
    if (!row.id) continue;
    map.set(
      String(row.id),
      row.lifecycle_status != null ? String(row.lifecycle_status) : null,
    );
  }
  return map;
}

export async function mapOpportunityRecordToReadModel(
  client: SupabaseClient,
  tenantId: string,
  record: OpportunityRecord,
  leadLifecycleById?: ReadonlyMap<string, string | null>,
): Promise<OpportunityReadModel> {
  const [identity, stageRow, productRow, leadRow] = await Promise.all([
    record.ownerUserId
      ? EmployeeIdentityService.getById(record.ownerUserId)
      : Promise.resolve(null),
    client
      .from("opportunity_stages")
      .select("id, name, stage_key")
      .eq("company_id", tenantId)
      .eq("id", record.stageId)
      .maybeSingle()
      .then((r) => r.data),
    record.primaryProductId
      ? client
          .from("catalog_products")
          .select("id, name")
          .eq("company_id", tenantId)
          .eq("id", record.primaryProductId)
          .is("deleted_at", null)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    record.leadId && !leadLifecycleById
      ? client
          .from("leads")
          .select("lifecycle_status")
          .eq("company_id", tenantId)
          .eq("id", record.leadId)
          .is("deleted_at", null)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const stageKey = stageRow?.stage_key
    ? (String(stageRow.stage_key) as OpportunityStageKey)
    : null;

  const mapped = toOpportunity(record, {
    tenantId,
    owner: identity?.fullName ?? null,
    stage: stageRow?.name ? String(stageRow.name) : "",
    stageKey,
  });

  return Object.freeze({
    id: mapped.id,
    tenantId: mapped.tenantId,
    name: mapped.name,
    leadId: mapped.leadId,
    leadLifecycleStatus: record.leadId
      ? (leadLifecycleById?.get(record.leadId) ??
        (leadRow && "lifecycle_status" in leadRow && leadRow.lifecycle_status != null
          ? String(leadRow.lifecycle_status)
          : null))
      : null,
    customerId: mapped.customerId,
    primaryProductId: record.primaryProductId,
    primaryProductName: productRow?.name ? String(productRow.name) : null,
    companyName: mapped.companyName,
    primaryContact: mapped.primaryContact,
    ownerId: mapped.ownerId,
    owner: mapped.owner,
    stageId: mapped.stageId,
    stage: mapped.stage,
    stageKey: mapped.stageKey,
    pipelineId: mapped.pipelineId,
    expectedRevenue: mapped.expectedRevenue,
    weightedRevenue: mapped.weightedRevenue,
    currency: mapped.currency,
    probabilityPercent: mapped.probabilityPercent,
    probabilityConfidence: mapped.probabilityConfidence,
    probabilitySource: mapped.probabilitySource,
    probabilityReason: mapped.probabilityReason,
    expectedCloseDate: mapped.expectedCloseDate,
    country: mapped.country,
    market: mapped.market,
    language: mapped.language,
    createdFromLead: mapped.createdFromLead,
    aiScoreSnapshot: mapped.aiScoreSnapshot,
    aiContextSnapshot: Object.freeze({ ...record.aiContextSnapshot }),
    currentQuoteId: mapped.currentQuoteId,
    wonAt: record.wonAt,
    lostAt: record.lostAt,
    lostReason: record.lostReason,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  });
}
