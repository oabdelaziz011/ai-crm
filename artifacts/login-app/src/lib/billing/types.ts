export type BillingSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "grace_period"
  | "expired"
  | "canceled";

export type BillingSettingValueType =
  | "string"
  | "integer"
  | "decimal"
  | "boolean"
  | "json"
  | "template_ref";

export type BillingSettingCategory =
  | "general"
  | "subscription"
  | "documents"
  | "branding"
  | "payments"
  | "communications"
  | "webhooks"
  | "usage"
  | "health"
  | "entitlements";

export type BillingSubscriptionStats = {
  total: number;
  active: number;
  trialing: number;
  at_risk: number;
};

export type BillingAuditStats = {
  total: number;
  manual: number;
  system: number;
  api: number;
};

export type PagedCompanySubscriptions = {
  total: number;
  limit: number;
  offset: number;
  rows: CompanySubscription[];
  stats: BillingSubscriptionStats;
  degraded?: boolean;
  degradedMessage?: string;
};

export type PagedBillingAuditLogs = {
  total: number;
  limit: number;
  offset: number;
  rows: BillingAuditLog[];
  stats?: BillingAuditStats;
  degraded?: boolean;
  degradedMessage?: string;
};

export type CompanySubscription = {
  id: string;
  company_id: string;
  plan_id: string | null;
  status: BillingSubscriptionStatus;
  billing_cycle: "monthly" | "yearly";
  current_period_start: string | null;
  current_period_end: string | null;
  next_renewal_at: string | null;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  auto_renewal: boolean;
  payment_method_label: string | null;
  /** Frozen package feature codes at last assign (packaging history — not runtime SoT). */
  package_feature_snapshot?: string[] | unknown;
  package_assigned_at?: string | null;
  package_assigned_by?: string | null;
  created_at: string;
  updated_at: string;
  company?: {
    id: string;
    name: string;
    logo_url: string | null;
    company_type: string | null;
    status?: string | null;
    approval_status?: string | null;
    created_at?: string;
  } | null;
  plan?: {
    id: string;
    name: string;
    display_name: string | null;
    code: string;
    tier_rank: number;
    pricing_mode?: string | null;
    price_monthly: number;
    price_yearly: number;
    max_users: number | null;
    max_customers: number | null;
    storage_gb: number | null;
    ai_tokens_monthly: number | null;
    features: unknown;
  } | null;
};

export type BillingContact = {
  id: string;
  company_id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
};

export type SubscriptionEvent = {
  id: string;
  company_id: string;
  subscription_id: string;
  event_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export type BillingSettingRow = {
  code: string;
  category: string;
  label: string;
  description: string | null;
  value_type: BillingSettingValueType;
  scope_type: string;
  value: unknown;
  default_value: unknown;
  version: number;
  validation_schema?: Record<string, unknown> | null;
};

export type BillingAuditLog = {
  id: string;
  event_type: string;
  company_id: string | null;
  user_id: string | null;
  source: "system" | "manual" | "api";
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  occurred_at: string;
  company?: { id: string; name: string; logo_url: string | null } | null;
};

export type CompanyEntitlement = {
  feature_code: string;
  label: string;
  category?: string;
  enabled: boolean;
  source: "override" | "plan" | "default" | "trial" | "manual" | "contract" | "system" | "none" | string;
  limit_value: Record<string, unknown>;
  starts_at?: string | null;
  expires_at?: string | null;
  notes?: string | null;
  is_commercial?: boolean;
  override_state?: "enabled" | "disabled" | null;
};

export type CompanyUsageSnapshot = {
  id: string;
  company_id: string;
  snapshot_date: string;
  metrics: Record<string, number>;
  source: string;
};

export type BillingInvoiceStatus = "draft" | "issued" | "paid" | "void" | "overdue";

export type BillingPaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded";

export type BillingInvoice = {
  id: string;
  invoice_number: string;
  company_id: string;
  subscription_id: string | null;
  billing_payment_id: string | null;
  status: BillingInvoiceStatus;
  currency: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  period_start: string | null;
  period_end: string | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type BillingPayment = {
  id: string;
  company_id: string;
  subscription_id: string | null;
  billing_invoice_id: string | null;
  receipt_id: string | null;
  payment_method_label: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  status: BillingPaymentStatus;
  amount: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
};

export type BillingReceipt = {
  id: string;
  receipt_number: string;
  company_id: string;
  subscription_id: string | null;
  billing_invoice_id: string | null;
  billing_payment_id: string | null;
  amount: number;
  currency: string;
  payment_method_label: string | null;
  document_url: string | null;
  issued_at: string;
  created_at: string;
};

export type BillingAuditEventType = {
  code: string;
  label: string;
  description: string | null;
};
