import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationTransfer, TransferRequest, TransferStatus } from "@/lib/organization/types";
import { getEnterpriseEventPublisher } from "@/lib/integration/events/enterprise-event-publisher";

function mapTransfer(row: Record<string, unknown>): OrganizationTransfer {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    transferType: row.transfer_type as OrganizationTransfer["transferType"],
    status: row.status as TransferStatus,
    sourceBranchId: row.source_branch_id ? String(row.source_branch_id) : null,
    targetBranchId: row.target_branch_id ? String(row.target_branch_id) : null,
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    reason: row.reason ? String(row.reason) : null,
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    createdAt: String(row.created_at),
  };
}

/** Cross-branch transfer engine with approval workflow and rollback. */
export class TransferEngineService {
  constructor(private readonly client: SupabaseClient) {}

  async requestTransfer(input: TransferRequest): Promise<OrganizationTransfer> {
    const { data: booking } = await this.client
      .from("scheduling_bookings")
      .select("id, branch_id, company_id")
      .eq("id", input.entityId)
      .maybeSingle();

    const snapshot = booking ? { branch_id: booking.branch_id } : null;

    const { data, error } = await this.client
      .from("organization_transfers")
      .insert({
        company_id: input.companyId,
        transfer_type: input.transferType,
        source_branch_id: input.sourceBranchId,
        target_branch_id: input.targetBranchId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        reason: input.reason ?? null,
        requested_by: input.requestedBy,
        rollback_snapshot: snapshot,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await this.client.from("organization_audit_log").insert({
      company_id: input.companyId,
      action: "transfer.requested",
      entity_type: input.transferType,
      entity_id: input.entityId,
      actor_id: input.requestedBy,
      metadata: { transferId: data.id },
    });

    return mapTransfer(data);
  }

  async approve(companyId: string, transferId: string, approverId: string, notes?: string): Promise<OrganizationTransfer> {
    const { data, error } = await this.client
      .from("organization_transfers")
      .update({ status: "approved", approved_by: approverId })
      .eq("id", transferId)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await this.client.from("organization_transfer_approvals").insert({
      company_id: companyId,
      transfer_id: transferId,
      approver_id: approverId,
      decision: "approved",
      notes: notes ?? null,
    });

    return mapTransfer(data);
  }

  async execute(companyId: string, transferId: string): Promise<OrganizationTransfer> {
    const { data: transfer, error } = await this.client
      .from("organization_transfers")
      .select("*")
      .eq("id", transferId)
      .eq("company_id", companyId)
      .single();
    if (error || !transfer) throw new Error("Transfer not found");

    if (transfer.transfer_type === "booking" && transfer.status === "approved") {
      const { error: updateError } = await this.client
        .from("scheduling_bookings")
        .update({ branch_id: transfer.target_branch_id, updated_at: new Date().toISOString() })
        .eq("id", transfer.entity_id)
        .eq("company_id", companyId);
      if (updateError) throw new Error(updateError.message);
    }

    if (transfer.transfer_type === "doctor" && transfer.status === "approved") {
      await this.client
        .from("organization_resource_assignments")
        .update({ branch_id: transfer.target_branch_id, assignment_type: "temporary" })
        .eq("resource_id", transfer.entity_id)
        .eq("company_id", companyId);
    }

    const { data: completed, error: completeError } = await this.client
      .from("organization_transfers")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", transferId)
      .select("*")
      .single();
    if (completeError) throw new Error(completeError.message);

    await this.client.from("organization_audit_log").insert({
      company_id: companyId,
      action: "transfer.completed",
      entity_type: transfer.transfer_type,
      entity_id: transfer.entity_id,
    });

    await getEnterpriseEventPublisher().publish({
      companyId,
      eventType: "organization.transfer",
      eventId: `${transferId}:organization.transfer`,
      payload: {
        transferId,
        transferType: transfer.transfer_type,
        entityId: transfer.entity_id,
        sourceBranchId: transfer.source_branch_id,
        targetBranchId: transfer.target_branch_id,
        status: "completed",
      },
    });

    return mapTransfer(completed);
  }

  async rollback(companyId: string, transferId: string): Promise<OrganizationTransfer> {
    const { data: transfer, error } = await this.client
      .from("organization_transfers")
      .select("*")
      .eq("id", transferId)
      .eq("company_id", companyId)
      .single();
    if (error || !transfer) throw new Error("Transfer not found");

    const snapshot = transfer.rollback_snapshot as { branch_id?: string } | null;

    if (transfer.transfer_type === "booking" && snapshot?.branch_id) {
      await this.client
        .from("scheduling_bookings")
        .update({ branch_id: snapshot.branch_id })
        .eq("id", transfer.entity_id);
    }

    const { data, error: rollbackError } = await this.client
      .from("organization_transfers")
      .update({ status: "rolled_back" })
      .eq("id", transferId)
      .select("*")
      .single();
    if (rollbackError) throw new Error(rollbackError.message);

    return mapTransfer(data);
  }

  async listPending(companyId: string): Promise<OrganizationTransfer[]> {
    const { data, error } = await this.client
      .from("organization_transfers")
      .select("*")
      .eq("company_id", companyId)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTransfer);
  }

  async listAll(companyId: string, limit = 50): Promise<OrganizationTransfer[]> {
    const { data, error } = await this.client
      .from("organization_transfers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTransfer);
  }
}
