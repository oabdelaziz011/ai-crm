import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SchedulingService,
  ServiceInsert,
  ServiceUpdate,
} from "../types";

export class SchedulingServiceCatalogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<SchedulingService[]> {
    const { data, error } = await this.client
      .from("scheduling_services")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name");

    if (error) throw new Error(error.message);
    return (data ?? []) as SchedulingService[];
  }

  async getById(id: string, companyId: string): Promise<SchedulingService | null> {
    const { data, error } = await this.client
      .from("scheduling_services")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as SchedulingService | null) ?? null;
  }

  async create(values: ServiceInsert): Promise<SchedulingService> {
    const { data, error } = await this.client
      .from("scheduling_services")
      .insert(values)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingService;
  }

  async update(
    id: string,
    companyId: string,
    values: ServiceUpdate,
  ): Promise<SchedulingService> {
    const { data, error } = await this.client
      .from("scheduling_services")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingService;
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    const { error } = await this.client
      .from("scheduling_services")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }
}
