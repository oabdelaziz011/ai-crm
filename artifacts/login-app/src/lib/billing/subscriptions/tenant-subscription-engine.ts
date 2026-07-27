import type { SupabaseClient } from "@supabase/supabase-js";

/** Future-ready SaaS tenant subscription engine — delegates to platform billing. */
export class TenantSubscriptionEngine {
  constructor(private readonly client: SupabaseClient) {}

  async getActiveSubscription(companyId: string) {
    const { data, error } = await this.client
      .from("company_subscriptions")
      .select("id, status, billing_cycle, current_period_end, trial_ends_at, grace_period_ends_at, plan_id")
      .eq("company_id", companyId)
      .in("status", ["active", "trialing", "grace_period", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async isInGracePeriod(companyId: string): Promise<boolean> {
    const sub = await this.getActiveSubscription(companyId);
    if (!sub) return false;
    return sub.status === "grace_period" || sub.status === "past_due";
  }

  async canUpgrade(companyId: string): Promise<boolean> {
    const sub = await this.getActiveSubscription(companyId);
    return Boolean(sub && ["active", "trialing"].includes(sub.status));
  }
}
