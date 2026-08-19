import { supabase } from "@/lib/supabase";

export type WorkspaceBillingSummary = {
  schema_version: number;
  company_id: string;
  subscription: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  company: { id: string; name: string; logo_url?: string | null; status?: string | null; approval_status?: string | null } | null;
  billing_contact: Record<string, unknown> | null;
  next_invoice_amount: number | null;
  list_price_amount?: number | null;
  payable_source?: string | null;
  discount_percent?: number | null;
  online_checkout_allowed?: boolean;
  approval_status?: string | null;
  pre_approval_paid?: boolean;
  pre_approval_paid_at?: string | null;
  payment_portal_state?: "awaiting_approval" | "not_configured" | "payment_required" | "standard" | string;
  currency: string | null;
  workspace_health: "healthy" | "at_risk" | "critical" | string;
};

export async function fetchWorkspaceBillingSummaryV1(): Promise<WorkspaceBillingSummary> {
  const { data, error } = await supabase.rpc("get_workspace_billing_summary_v1");
  if (error) throw new Error(error.message);
  return data as WorkspaceBillingSummary;
}
