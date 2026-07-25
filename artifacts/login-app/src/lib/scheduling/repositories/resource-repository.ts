import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Branch,
  ResourceInsert,
  ResourceUpdate,
  SchedulingResource,
} from "@/lib/scheduling/types";

export class SchedulingBranchRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<Branch[]> {
    const { data, error } = await this.client
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name");

    if (error) throw new Error(error.message);
    return (data ?? []) as Branch[];
  }
}

export class SchedulingResourceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<SchedulingResource[]> {
    const { data, error } = await this.client
      .from("scheduling_resources")
      .select("*, branches(id, name)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name");

    if (error) throw new Error(error.message);
    return (data ?? []) as SchedulingResource[];
  }

  async getById(id: string, companyId: string): Promise<SchedulingResource | null> {
    const { data, error } = await this.client
      .from("scheduling_resources")
      .select("*, branches(id, name)")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as SchedulingResource | null) ?? null;
  }

  async create(values: ResourceInsert): Promise<SchedulingResource> {
    const { data, error } = await this.client
      .from("scheduling_resources")
      .insert(values)
      .select("*, branches(id, name)")
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingResource;
  }

  async update(
    id: string,
    companyId: string,
    values: ResourceUpdate,
  ): Promise<SchedulingResource> {
    const { data, error } = await this.client
      .from("scheduling_resources")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*, branches(id, name)")
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingResource;
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    const { error } = await this.client
      .from("scheduling_resources")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }
}
