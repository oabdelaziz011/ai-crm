import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRecord, OpportunityStageKey } from "@workspace/opportunity-platform";
import { toOpportunity } from "@workspace/opportunity-platform";
import type { OpportunityReadModel } from "@workspace/application-layer";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";

export async function mapOpportunityRecordToReadModel(
  client: SupabaseClient,
  tenantId: string,
  record: OpportunityRecord,
): Promise<OpportunityReadModel> {
  const [identity, stageRow] = await Promise.all([
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
    customerId: mapped.customerId,
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
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  });
}
