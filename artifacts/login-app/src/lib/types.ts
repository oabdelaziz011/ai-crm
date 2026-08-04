export type Customer = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  user_id?: string;
  company_id: string | null;
  email?: string | null;
  full_name: string | null;
  avatar_url?: string | null;
  job_title?: string | null;
  preferred_language?: string | null;
  preferred_theme?: string | null;
  timezone?: string | null;
  is_super_admin: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type MyProfile = {
  id: string;
  user_id: string;
  company_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  preferred_language: string | null;
  preferred_theme: string | null;
  timezone: string | null;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  company: { id: string; name: string | null } | null;
};

export type MyProfileUpdate = Partial<
  Pick<MyProfile, "full_name" | "avatar_url" | "preferred_language" | "preferred_theme" | "timezone">
>;

export type CompanyStatus = "Active" | "Suspended" | "Trial";
export type PlanTier = "Basic" | "Pro" | "Enterprise";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "grace_period" | "canceled" | "expired";
export type BillingCycle = "monthly" | "yearly";

export type Plan = {
  id: string;
  name: PlanTier;
  code: "basic" | "pro" | "enterprise";
  display_name?: string | null;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
  tier_rank?: number;
  max_users?: number | null;
  max_customers?: number | null;
  storage_gb?: number | null;
  ai_tokens_monthly?: number | null;
  features?: unknown;
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
    email?: string | null;
  } | null;
  company?: {
    id: string;
    name: string | null;
  } | null;
};

export type EnrichedAuditLog = AuditLog & {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  company: {
    id: string;
    name: string | null;
  } | null;
  actorRoleName: string | null;
  entityDisplayName: string | null;
  resolvedReferences: {
    companyNames: Record<string, string>;
    roleNames: Record<string, string>;
    userNames: Record<string, string>;
    permissionCodes: Record<string, string>;
  };
};

export type NotificationType = "success" | "warning" | "error" | "info";
export type NotificationCategory = "booking" | "invoice" | "subscription" | "whatsapp" | "system" | "customer" | "payment";
export type NotificationItem = {
  id: string;
  company_id: string;
  user_id: string | null;
  /** i18n title key stored in notifications.title */
  title_key: string;
  /** JSON payload: { messageKey, params } stored in notifications.message */
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  is_read: boolean;
  created_at: string;
};

export type TenantProvisioningStatus = "pending" | "provisioning" | "completed" | "failed";

export type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  company_type?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status: CompanyStatus;
  plan_id: string | null;
  subscription_plan: string;
  subscription_status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  subscription_expires_at: string | null;
  tenant_provisioning_status?: TenantProvisioningStatus;
  provisioning_error?: string | null;
  provisioned_at?: string | null;
  provisioning_attempt_count?: number;
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
  doctor_id: string | null;
  location_id: string | null;
  booking_date: string;
  duration_minutes: number | null;
  notes: string | null;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "id" | "name"> | null;
  /** True when sourced from scheduling_bookings (S4.6). */
  isSchedulingBooking?: boolean;
  service_id?: string | null;
  resource_id?: string | null;
  scheduling_status?: string;
  source?: string;
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

export type BookingInsert = Omit<
  Booking,
  "id" | "user_id" | "created_at" | "updated_at" | "customers" | "doctor_id" | "location_id" | "duration_minutes" | "notes"
> & {
  doctor_id?: string | null;
  location_id?: string | null;
  duration_minutes?: number | null;
  notes?: string | null;
};
export type BookingUpdate = Partial<BookingInsert>;

export type InvoiceInsert = Omit<Invoice, "id" | "user_id" | "created_at" | "updated_at" | "customers">;
export type InvoiceUpdate = Partial<InvoiceInsert>;

export type AiAssistantLanguage = "en" | "ar";
export type AiAssistantResponseLanguage = "en" | "ar" | "system";
export type AiAssistantProvider = "openai" | "anthropic" | "google" | "azure";
export type AiAssistantTone = "friendly" | "professional" | "formal";

export type AiAssistantSettings = {
  id: string;
  company_id: string;
  assistant_name: string;
  assistant_avatar: string | null;
  language: AiAssistantLanguage;
  personality: string;
  tone: AiAssistantTone;
  welcome_message: string;
  fallback_message: string;
  working_hours_enabled: boolean;
  allow_auto_booking: boolean;
  allow_reschedule: boolean;
  allow_cancellation: boolean;
  handoff_to_human: boolean;
  knowledge_enabled: boolean;
  remember_conversation: boolean;
  conversation_timeout_minutes: number;
  max_conversation_age: number;
  is_enabled: boolean;
  provider: AiAssistantProvider;
  model: string;
  temperature: number;
  max_tokens: number;
  response_language: AiAssistantResponseLanguage;
  version: number;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AiAssistantSettingsInsert = Omit<
  AiAssistantSettings,
  "id" | "created_at" | "updated_at" | "created_by" | "updated_by" | "version" | "deleted_at" | "deleted_by"
>;

export type AiAssistantSettingsUpdate = Partial<
  Omit<AiAssistantSettingsInsert, "company_id">
>;

export type ConversationChannelType =
  | "web_chat"
  | "whatsapp"
  | "messenger"
  | "telegram"
  | "instagram"
  | "voice"
  | "email"
  | "sms";

export type ConversationState =
  | "idle"
  | "greeting"
  | "collecting_information"
  | "waiting_user"
  | "waiting_api"
  | "completed"
  | "cancelled"
  | "transferred_to_human"
  | "closed";

export type ConversationParticipantType = "customer" | "employee" | "assistant" | "system";

export type ConversationMessageType = "incoming" | "outgoing" | "system" | "internal_note";

export type ConversationMessageContentType =
  | "text"
  | "audio"
  | "image"
  | "template"
  | "tool_result"
  | "system"
  | "media"
  | "json";

export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export type ConversationMessageStatus = "pending" | "sent" | "delivered" | "failed" | "read";

export type Conversation = {
  id: string;
  company_id: string;
  conversation_number: string;
  company_channel_id: string | null;
  ai_assistant_id: string;
  channel_type: ConversationChannelType;
  channel_instance_id: string | null;
  state: ConversationState;
  external_thread_id: string | null;
  customer_id: string | null;
  assigned_user_id: string | null;
  metadata: Record<string, unknown>;
  priority: ConversationPriority;
  locked_by: string | null;
  locked_at: string | null;
  unread_count_employee: number;
  unread_count_customer: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_participant_type: ConversationParticipantType | null;
  search_text: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ConversationParticipant = {
  id: string;
  conversation_id: string;
  participant_type: ConversationParticipantType;
  display_name: string | null;
  profile_ref: string | null;
  external_participant_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  participant_id: string | null;
  sequence_number: number;
  message_type: ConversationMessageType;
  content_type: ConversationMessageContentType;
  content: string;
  metadata: Record<string, unknown>;
  status: ConversationMessageStatus;
  external_message_id: string | null;
  attachment_type: string | null;
  attachment_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  search_text: string;
  created_at: string;
  created_by: string | null;
};

export type CommunicationChannelKey =
  | "whatsapp"
  | "telegram"
  | "messenger"
  | "instagram"
  | "web_chat"
  | "email"
  | "sms"
  | "voice";

export type CompanyChannelStatus = "pending" | "active" | "disabled" | "error";

export type ChannelHealthStatus = "connected" | "disconnected" | "warning" | "error" | "unknown";

export type CommunicationChannel = {
  id: string;
  key: CommunicationChannelKey;
  display_name: string;
  description: string;
  icon: string | null;
  supports_media: boolean;
  supports_templates: boolean;
  supports_reactions: boolean;
  supports_typing: boolean;
  supports_read_receipts: boolean;
  supports_delivery_receipts: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyChannel = {
  id: string;
  company_id: string;
  channel_id: string;
  display_name: string;
  status: CompanyChannelStatus;
  provider: string;
  configuration: Record<string, unknown>;
  webhook_url: string | null;
  webhook_secret: string | null;
  external_account_id: string | null;
  is_default: boolean;
  is_enabled: boolean;
  health_status: ChannelHealthStatus;
  last_health_check: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  communication_channel?: CommunicationChannel | null;
};
