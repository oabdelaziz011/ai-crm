export type Customer = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  company_id: string | null;
  full_name: string | null;
  is_super_admin: boolean;
};

export type CompanyStatus = "Active" | "Suspended" | "Trial";
export type PlanTier = "Basic" | "Pro" | "Enterprise";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired";
export type BillingCycle = "monthly" | "yearly";

export type Plan = {
  id: string;
  name: PlanTier;
  code: "basic" | "pro" | "enterprise";
  price_monthly: number;
  price_yearly: number;
  created_at: string;
  updated_at: string;
};

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";
export type AuditLog = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  profile?: {
    id: string;
    full_name: string | null;
  } | null;
  company?: {
    id: string;
    name: string;
  } | null;
};

export type NotificationType = "success" | "warning" | "error" | "info";
export type NotificationCategory = "booking" | "invoice" | "subscription" | "whatsapp" | "system";
export type NotificationItem = {
  id: string;
  company_id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  is_read: boolean;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  status: CompanyStatus;
  plan_id: string | null;
  subscription_plan: string;
  subscription_status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  subscription_expires_at: string | null;
  created_at: string;
  updated_at: string;
  plan?: Plan | null;
};

export type BookingStatus = "Pending" | "Confirmed" | "Cancelled";
export type Booking = {
  id: string;
  user_id: string;
  customer_id: string | null;
  service: string;
  booking_date: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "id" | "name"> | null;
};

export type InvoiceStatus = "Unpaid" | "Paid" | "Overdue";
export type Invoice = {
  id: string;
  user_id: string;
  customer_id: string | null;
  amount: number;
  status: InvoiceStatus;
  invoice_date: string;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "id" | "name"> | null;
};

export type CustomerInsert = Omit<Customer, "id" | "user_id" | "created_at" | "updated_at">;
export type CustomerUpdate = Partial<CustomerInsert>;

export type ProfileInsert = Omit<Profile, "id">;
export type ProfileUpdate = Partial<ProfileInsert>;

export type CompanyInsert = {
  name: string;
  status: CompanyStatus;
  subscription_plan: string;
  plan_id?: string | null;
  subscription_status?: SubscriptionStatus;
  billing_cycle?: BillingCycle;
  subscription_expires_at?: string | null;
  logo_url?: string | null;
};
export type CompanyUpdate = Partial<CompanyInsert>;

export type BookingInsert = Omit<Booking, "id" | "user_id" | "created_at" | "updated_at" | "customers">;
export type BookingUpdate = Partial<BookingInsert>;

export type InvoiceInsert = Omit<Invoice, "id" | "user_id" | "created_at" | "updated_at" | "customers">;
export type InvoiceUpdate = Partial<InvoiceInsert>;
