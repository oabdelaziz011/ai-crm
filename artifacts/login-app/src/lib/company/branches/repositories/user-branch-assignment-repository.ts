import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserBranchAssignment } from "@/lib/company/branches/types";

export class UserBranchAssignmentRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<UserBranchAssignment[]> {
    const { data, error } = await this.client
      .from("user_branch_assignments")
      .select("*")
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
    return (data ?? []) as UserBranchAssignment[];
  }

  async listByUser(userId: string, companyId: string): Promise<UserBranchAssignment[]> {
    const { data, error } = await this.client
      .from("user_branch_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
    return (data ?? []) as UserBranchAssignment[];
  }

  async listBranchIdsByUser(userId: string, companyId: string): Promise<string[]> {
    const rows = await this.listByUser(userId, companyId);
    return rows.map((row) => row.branch_id);
  }

  async replaceForUser(userId: string, companyId: string, branchIds: string[]): Promise<void> {
    const { error: deleteError } = await this.client
      .from("user_branch_assignments")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", companyId);

    if (deleteError) throw new Error(deleteError.message);

    if (branchIds.length === 0) return;

    const rows = branchIds.map((branchId) => ({
      user_id: userId,
      company_id: companyId,
      branch_id: branchId,
    }));

    const { error: insertError } = await this.client.from("user_branch_assignments").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  async getAssignmentMap(companyId: string): Promise<Record<string, string[]>> {
    const rows = await this.listByCompany(companyId);
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      const list = map[row.user_id] ?? [];
      list.push(row.branch_id);
      map[row.user_id] = list;
    }
    return map;
  }
}
