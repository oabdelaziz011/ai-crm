/** Internal entity keys stored in audit_logs.entity — never shown in UI. */
export const AUDIT_ENTITY_KEYS = [
  "profiles",
  "companies",
  "user_roles",
  "role_permissions",
  "user_permissions",
  "notifications",
  "plans",
  "customers",
  "bookings",
  "scheduling_bookings",
  "business_appointment_exceptions",
  "business_appointment_exception_items",
  "invoices",
  "roles",
  "permissions",
  "auth",
  "ai_assistant_settings",
  "conversations",
  "conversation_participants",
  "conversation_messages",
  "communication_channels",
  "company_channels",
] as const;

export type AuditEntityKey = (typeof AUDIT_ENTITY_KEYS)[number];

export const AUDIT_OPERATIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "PASSWORD_RESET",
  "INVITE_USER",
] as const;

export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];

export const AUDIT_STATUSES = ["success", "failed", "warning"] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export type AuditOperationCategory = "create" | "update" | "delete" | "auth" | "system";

export const ENTITY_I18N_KEY: Record<string, string> = {
  profiles: "auditLogs.entities.users",
  companies: "auditLogs.entities.companies",
  user_roles: "auditLogs.entities.userRoles",
  role_permissions: "auditLogs.entities.rolePermissions",
  user_permissions: "auditLogs.entities.userPermissions",
  notifications: "auditLogs.entities.notifications",
  plans: "auditLogs.entities.subscriptionPlans",
  customers: "auditLogs.entities.customers",
  bookings: "auditLogs.entities.bookings",
  scheduling_bookings: "auditLogs.entities.schedulingBookings",
  business_appointment_exceptions: "auditLogs.entities.businessAppointmentExceptions",
  business_appointment_exception_items: "auditLogs.entities.businessAppointmentExceptionItems",
  invoices: "auditLogs.entities.invoices",
  roles: "auditLogs.entities.roles",
  permissions: "auditLogs.entities.permissions",
  auth: "auditLogs.entities.authentication",
  ai_assistant_settings: "auditLogs.entities.aiAssistantSettings",
  conversations: "auditLogs.entities.conversations",
  conversation_participants: "auditLogs.entities.conversationParticipants",
  conversation_messages: "auditLogs.entities.conversationMessages",
  communication_channels: "auditLogs.entities.communicationChannels",
  company_channels: "auditLogs.entities.companyChannels",
};

export const METADATA_FIELD_I18N_KEY: Record<string, string> = {
  name: "auditLogs.fields.name",
  email: "auditLogs.fields.email",
  full_name: "auditLogs.fields.fullName",
  status: "auditLogs.fields.status",
  service: "auditLogs.fields.service",
  amount: "auditLogs.fields.amount",
  code: "auditLogs.fields.code",
  description: "auditLogs.fields.description",
  company_id: "auditLogs.fields.company",
  role_id: "auditLogs.fields.role",
  user_id: "auditLogs.fields.user",
  permission_id: "auditLogs.fields.permission",
  is_active: "auditLogs.fields.active",
  assistant_name: "auditLogs.fields.assistantName",
  language: "auditLogs.fields.language",
  tone: "auditLogs.fields.tone",
  channel_type: "auditLogs.fields.channelType",
  state: "auditLogs.fields.state",
  message_type: "auditLogs.fields.messageType",
  participant_type: "auditLogs.fields.participantType",
  priority: "auditLogs.fields.priority",
  conversation_number: "auditLogs.fields.conversationNumber",
  health_status: "auditLogs.fields.healthStatus",
  provider: "auditLogs.fields.provider",
};

export const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "0:0:0:0:0:0:0:1", "localhost"]);

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
