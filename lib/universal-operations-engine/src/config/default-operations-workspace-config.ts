import { SEED_CUSTOMER360_SECTIONS, SEED_INTELLIGENCE_BLOCKS, SEED_COPILOT_CAPABILITIES, SEED_BUSINESS_CONTEXT_BY_TEMPLATE } from "./seed/operations-seed-data.js";
import type { OperationsWorkspaceConfig } from "../types/metadata-types.js";
import { AUTOMOTIVE_COLUMNS, CLINIC_COLUMNS, TRAINING_COLUMNS } from "../mock/mock-columns.js";

const CLINIC_STATUSES: OperationsWorkspaceConfig["statuses"] = [
  { id: "st_booked", internalName: "booked", displayName: "Booked", color: "#6366f1", icon: "Calendar", isTerminal: false, sortOrder: 0, permissions: [] },
  { id: "st_confirmed", internalName: "confirmed", displayName: "Confirmed", color: "#3b82f6", icon: "CheckCircle", isTerminal: false, sortOrder: 1, permissions: [] },
  { id: "st_checked_in", internalName: "checked_in", displayName: "Checked In", color: "#0ea5e9", icon: "LogIn", isTerminal: false, sortOrder: 2, permissions: ["operations.queue.checkin"] },
  { id: "st_in_progress", internalName: "in_progress", displayName: "In Progress", color: "#f59e0b", icon: "Activity", isTerminal: false, sortOrder: 3, permissions: [] },
  { id: "st_completed", internalName: "completed", displayName: "Completed", color: "#22c55e", icon: "CheckCheck", isTerminal: true, sortOrder: 4, permissions: ["operations.queue.complete"] },
  { id: "st_archived", internalName: "archived", displayName: "Archived", color: "#64748b", icon: "Archive", isTerminal: true, sortOrder: 5, permissions: [] },
];

const CLINIC_TRANSITIONS: OperationsWorkspaceConfig["statusTransitions"] = [
  { fromStatusId: "st_booked", toStatusId: "st_confirmed" },
  { fromStatusId: "st_confirmed", toStatusId: "st_checked_in" },
  { fromStatusId: "st_checked_in", toStatusId: "st_in_progress" },
  { fromStatusId: "st_in_progress", toStatusId: "st_completed" },
  { fromStatusId: "st_completed", toStatusId: "st_archived" },
];

const PAYMENT_STATUSES: OperationsWorkspaceConfig["paymentStatuses"] = [
  { id: "pay_unpaid", internalName: "unpaid", displayName: "Unpaid", color: "#ef4444", sortOrder: 0 },
  { id: "pay_partial", internalName: "partial", displayName: "Partial", color: "#f59e0b", sortOrder: 1 },
  { id: "pay_paid", internalName: "paid", displayName: "Paid", color: "#22c55e", sortOrder: 2 },
  { id: "pay_refunded", internalName: "refunded", displayName: "Refunded", color: "#64748b", sortOrder: 3 },
];

const SERVICES: OperationsWorkspaceConfig["services"] = [
  { id: "svc_consult", name: "Consultation", priceCents: 15000, durationMinutes: 30, vatPercent: 15, resourceIds: ["res_dr_a", "res_dr_b"], color: "#6366f1", capacity: 1, onlineBooking: true, cancellationPolicy: "24h notice", bufferMinutes: 10, active: true },
  { id: "svc_followup", name: "Follow-up", priceCents: 8000, durationMinutes: 20, vatPercent: 15, resourceIds: ["res_dr_a"], color: "#0ea5e9", capacity: 1, onlineBooking: true, cancellationPolicy: "12h notice", bufferMinutes: 5, active: true },
];

const RESOURCES: OperationsWorkspaceConfig["resources"] = [
  { id: "res_dr_a", name: "Dr. Amira Hassan", type: "doctor", branchId: "br_main", color: "#6366f1", active: true },
  { id: "res_dr_b", name: "Dr. Omar Khalil", type: "doctor", branchId: "br_main", color: "#8b5cf6", active: true },
  { id: "res_room_1", name: "Room 1", type: "room", branchId: "br_main", color: "#64748b", active: true },
];

const WORKFLOW_STAGES = [
  { id: "booked", labelKey: "workflow.booked", sortOrder: 0 },
  { id: "confirmed", labelKey: "workflow.confirmed", sortOrder: 1 },
  { id: "checked_in", labelKey: "workflow.checkedIn", sortOrder: 2 },
  { id: "doctor", labelKey: "workflow.doctor", sortOrder: 3 },
  { id: "cashier", labelKey: "workflow.cashier", sortOrder: 4 },
  { id: "completed", labelKey: "workflow.completed", sortOrder: 5 },
];

const ALERT_RULES: OperationsWorkspaceConfig["intelligence"]["alertRules"] = [
  { id: "alert_vip", alertType: "vip", titleKey: "alertRules.vip.title", messageKey: "alertRules.vip.message", severity: "info", priority: "high", color: "#f59e0b", icon: "Star", actionKey: "assign_vip", enabled: true },
  { id: "alert_balance", alertType: "outstanding", titleKey: "alertRules.outstanding.title", messageKey: "alertRules.outstanding.message", severity: "warning", priority: "high", color: "#ef4444", icon: "CreditCard", actionKey: "collect_payment", enabled: true },
  { id: "alert_waiting", alertType: "waiting_long", titleKey: "alertRules.waiting_long.title", messageKey: "alertRules.waiting_long.message", severity: "warning", priority: "urgent", color: "#f97316", icon: "Clock", actionKey: "notify_staff", enabled: true },
  { id: "alert_payment", alertType: "payment_delay", titleKey: "alertRules.payment_delay.title", messageKey: "alertRules.payment_delay.message", severity: "warning", priority: "normal", color: "#eab308", icon: "Banknote", actionKey: "collect_payment", enabled: true },
  { id: "alert_medical", alertType: "medical", titleKey: "alertRules.medical.title", messageKey: "alertRules.medical.message", severity: "critical", priority: "urgent", color: "#dc2626", icon: "AlertTriangle", actionKey: "view_notes", enabled: true },
  { id: "alert_noshow", alertType: "no_show_history", titleKey: "alertRules.no_show_history.title", messageKey: "alertRules.no_show_history.message", severity: "info", priority: "normal", color: "#64748b", icon: "UserX", actionKey: "confirm_attendance", enabled: true },
  { id: "alert_satisfaction", alertType: "low_satisfaction", titleKey: "alertRules.low_satisfaction.title", messageKey: "alertRules.low_satisfaction.message", severity: "info", priority: "low", color: "#8b5cf6", icon: "TrendingDown", actionKey: "escalate", enabled: true },
];

const RECOMMENDATION_RULES: OperationsWorkspaceConfig["intelligence"]["recommendationRules"] = [
  { id: "rec_collect", labelKey: "rec.collectPayment", reasonKey: "recReasons.rec_collect", actionKey: "collect_payment", enabled: true, minConfidence: 0.8 },
  { id: "rec_followup", labelKey: "rec.bookFollowup", reasonKey: "recReasons.rec_followup", actionKey: "book_followup", enabled: true, minConfidence: 0.75 },
  { id: "rec_whatsapp", labelKey: "rec.sendWhatsapp", reasonKey: "recReasons.rec_whatsapp", actionKey: "send_whatsapp", enabled: true, minConfidence: 0.7 },
  { id: "rec_task", labelKey: "rec.createTask", reasonKey: "recReasons.rec_task", actionKey: "create_task", enabled: true, minConfidence: 0.7 },
  { id: "rec_escalate", labelKey: "rec.escalate", reasonKey: "recReasons.rec_escalate", actionKey: "escalate", enabled: true, minConfidence: 0.65 },
];

const JOURNEY_STEPS = [
  { id: "ad", labelKey: "journey.ad", icon: "Megaphone" },
  { id: "lead", labelKey: "journey.lead", icon: "UserPlus" },
  { id: "qualified", labelKey: "journey.qualified", icon: "CheckCircle" },
  { id: "customer", labelKey: "journey.customer", icon: "User" },
  { id: "appointment", labelKey: "journey.appointment", icon: "Calendar" },
  { id: "deposit", labelKey: "journey.deposit", icon: "CreditCard" },
  { id: "waiting", labelKey: "journey.waiting", icon: "Clock" },
  { id: "doctor", labelKey: "journey.doctor", icon: "Stethoscope" },
  { id: "completed", labelKey: "journey.completed", icon: "CheckCheck" },
];

const DASHBOARD_WIDGETS: OperationsWorkspaceConfig["dashboard"]["widgets"] = [
  { id: "w_revenue", type: "revenue_today", labelKey: "widgets.revenueToday", visible: true, sortOrder: 0, pinned: true },
  { id: "w_bookings", type: "upcoming_bookings", labelKey: "widgets.upcomingBookings", visible: true, sortOrder: 1 },
  { id: "w_payments", type: "pending_payments", labelKey: "widgets.pendingPayments", visible: true, sortOrder: 2, pinned: true },
  { id: "w_employees", type: "employee_status", labelKey: "widgets.employeeStatus", visible: true, sortOrder: 3 },
  { id: "w_ai", type: "ai_recommendations", labelKey: "widgets.aiRecommendations", visible: true, sortOrder: 4 },
  { id: "w_tasks", type: "tasks", labelKey: "widgets.tasks", visible: true, sortOrder: 5 },
  { id: "w_leaderboard", type: "kpi_leaderboard", labelKey: "widgets.leaderboard", visible: true, sortOrder: 6 },
];

type TemplateSeed = {
  workspaceName: string;
  moduleName: string;
  rowEntityName: string;
  terminology: OperationsWorkspaceConfig["terminology"];
  columns: OperationsWorkspaceConfig["columns"];
};

const TEMPLATE_SEEDS: Record<string, TemplateSeed> = {
  clinic: {
    workspaceName: "Front Desk Operations",
    moduleName: "Operations",
    rowEntityName: "Visit",
    terminology: { customer: "Patient", resource: "Doctor", service: "Service", queue: "Waiting List", payment: "Payment", appointment: "Appointment", employee: "Provider", branch: "Branch" },
    columns: CLINIC_COLUMNS,
  },
  training_center: {
    workspaceName: "Training Operations",
    moduleName: "Operations",
    rowEntityName: "Session",
    terminology: { customer: "Student", resource: "Instructor", service: "Course", queue: "Session Queue", payment: "Tuition", appointment: "Session", employee: "Instructor", branch: "Campus" },
    columns: TRAINING_COLUMNS,
  },
  automotive: {
    workspaceName: "Service Bay Operations",
    moduleName: "Operations",
    rowEntityName: "Repair Job",
    terminology: { customer: "Customer", resource: "Technician", service: "Repair Type", queue: "Service Queue", payment: "Payment", appointment: "Job", employee: "Technician", branch: "Bay" },
    columns: AUTOMOTIVE_COLUMNS,
  },
};

function buildExtendedDefaults(
  statuses: OperationsWorkspaceConfig["statuses"],
  templateKey: string,
): Pick<
  OperationsWorkspaceConfig,
  | "views"
  | "permissions"
  | "notifications"
  | "ai"
  | "automation"
  | "dashboard"
  | "customer360"
  | "intelligence"
  | "businessContext"
  | "queueRules"
  | "sla"
  | "designer"
  | "forms"
  | "featureFlags"
  | "routing"
  | "kanban"
  | "calendar"
  | "timeline"
> {
  const businessContext = SEED_BUSINESS_CONTEXT_BY_TEMPLATE[templateKey] ?? SEED_BUSINESS_CONTEXT_BY_TEMPLATE.clinic!;
  return {
    views: {
      savedViews: [
        { id: "view_today", name: "Today", columnIds: [], filters: {}, sort: [{ columnId: "col_scheduled", direction: "asc" }], isDefault: true, isShared: true },
        { id: "view_waiting", name: "Waiting", columnIds: [], filters: { statusId: "st_checked_in" }, sort: [], isDefault: false, isShared: true },
        { id: "view_unpaid", name: "Unpaid", columnIds: [], filters: { paymentStatusId: "pay_unpaid" }, sort: [], isDefault: false, isShared: true },
      ],
      gridPreferences: { columnOrder: [], hiddenColumnIds: [], columnWidths: {}, pinnedColumns: {}, density: "comfortable" },
    },
    permissions: { columns: {}, statuses: {}, actions: {} },
    notifications: {
      email: { enabled: true, templateId: null },
      sms: { enabled: false, templateId: null },
      whatsapp: { enabled: true, templateId: null },
      push: { enabled: true, templateId: null },
      quietHours: null,
    },
    ai: {
      copilotEnabled: true,
      suggestionsEnabled: true,
      knowledgeSourceIds: [],
      allowedTools: ["summarize", "explain_timeline", "next_action", "whatsapp", "email"],
      copilotCapabilities: [...SEED_COPILOT_CAPABILITIES],
      safetyPolicies: { requireConfirmation: true },
    },
    automation: { linkedWorkflowTemplateIds: ["appointment_confirmation", "appointment_reminder"], enabledTriggerKeys: ["booking_created", "payment_received"] },
    dashboard: {
      widgets: DASHBOARD_WIDGETS,
      kpis: [
        { id: "kpi_total", label: "Total Items", metricKey: "total", visible: true },
        { id: "kpi_waiting", label: "Waiting", metricKey: "waiting", visible: true },
        { id: "kpi_paid", label: "Paid", metricKey: "paid", visible: true },
        { id: "kpi_completed", label: "Completed", metricKey: "completed", visible: true },
      ],
      charts: [],
    },
    customer360: { sections: [...SEED_CUSTOMER360_SECTIONS] },
    intelligence: {
      blocks: [...SEED_INTELLIGENCE_BLOCKS],
      workflowStages: WORKFLOW_STAGES,
      journeySteps: JOURNEY_STEPS,
      alertRules: ALERT_RULES,
      recommendationRules: RECOMMENDATION_RULES,
    },
    businessContext,
    queueRules: {
      defaultSort: [{ columnId: "col_scheduled", direction: "asc" }],
      defaultFilters: {},
      pageSize: 50,
      maxWaitingMinutes: 30,
    },
    sla: {
      rules: [
        { id: "sla_wait", name: "Max Wait Time", thresholdMinutes: 30, alertType: "waiting_long", enabled: true },
        { id: "sla_payment", name: "Payment Delay", thresholdMinutes: 60, alertType: "payment_delay", enabled: true },
      ],
    },
    designer: { layouts: [], activeLayoutId: null },
    forms: { schemas: [] },
    featureFlags: { flags: {} },
    routing: { rules: [] },
    kanban: {
      columns: statuses.map((s) => ({ id: `kanban_${s.id}`, statusId: s.id, label: s.displayName })),
      groupBy: "status",
    },
    calendar: { defaultView: "week", slotMinutes: 30, showWeekends: true },
    timeline: { groupBy: "date", showAiEvents: true },
  };
}

/** Builds the full enterprise default configuration for tenant seeding. */
export function buildDefaultOperationsWorkspaceConfig(
  templateKey: string,
  companyId: string,
): OperationsWorkspaceConfig {
  const seed = TEMPLATE_SEEDS[templateKey] ?? TEMPLATE_SEEDS.clinic!;
  const statuses = CLINIC_STATUSES;

  return {
    id: `cfg_${templateKey}`,
    companyId,
    templateKey,
    workspaceName: seed.workspaceName,
    moduleName: seed.moduleName,
    rowEntityName: seed.rowEntityName,
    terminology: seed.terminology,
    branding: { accentColor: "#6366f1", icon: "LayoutGrid", moduleIcon: "Briefcase" },
    columns: seed.columns,
    statuses,
    statusTransitions: CLINIC_TRANSITIONS,
    paymentStatuses: PAYMENT_STATUSES,
    services: SERVICES,
    resources: RESOURCES,
    ...buildExtendedDefaults(statuses, templateKey),
    updatedAt: new Date().toISOString(),
  };
}

export function getSupportedOperationsTemplateKeys(): string[] {
  return Object.keys(TEMPLATE_SEEDS);
}
