/**
 * Seed-only data for Configuration Platform tenant seeding.
 * Must NOT be imported by runtime engines or UI consumers.
 */
import type { Customer360SectionConfig } from "../../types/customer360-types.js";
import type { IntelligenceBlockConfig } from "../../types/intelligence-types.js";
import type { OperationsBusinessContextConfig } from "../../types/extended-config-types.js";
import type { OperationsCopilotCapabilityConfig } from "../../types/extended-config-types.js";

export const SEED_CUSTOMER360_SECTIONS: Customer360SectionConfig[] = [
  { id: "todays_operation", titleKey: "sections.todaysOperation", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 0 },
  { id: "customer_summary", titleKey: "sections.customerSummary", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "cashier", "nurse", "manager"], sortOrder: 1 },
  { id: "communication", titleKey: "sections.communication", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 2 },
  { id: "timeline", titleKey: "sections.timeline", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 3 },
  { id: "notes", titleKey: "sections.notes", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 4 },
  { id: "invoices_payments", titleKey: "sections.invoicesPayments", visible: true, collapsed: false, permissions: [], roles: ["cashier", "manager"], sortOrder: 5 },
  { id: "bookings", titleKey: "sections.bookings", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "manager"], sortOrder: 6 },
  { id: "files", titleKey: "sections.files", visible: true, collapsed: false, permissions: [], roles: ["nurse", "manager"], sortOrder: 7 },
  { id: "tasks", titleKey: "sections.tasks", visible: true, collapsed: false, permissions: [], roles: ["manager"], sortOrder: 8 },
  { id: "ai_assistant", titleKey: "sections.aiAssistant", visible: true, collapsed: false, permissions: [], roles: ["manager"], sortOrder: 9 },
];

export const SEED_INTELLIGENCE_BLOCKS: IntelligenceBlockConfig[] = [
  { id: "context_ribbon", visible: true, collapsed: false, roles: ["receptionist", "nurse", "manager"], sortOrder: 0, permissions: [] },
  { id: "workflow_tracker", visible: true, collapsed: false, roles: ["receptionist", "nurse", "manager"], sortOrder: 1, permissions: [] },
  { id: "alerts", visible: true, collapsed: false, roles: ["receptionist", "nurse", "manager"], sortOrder: 2, permissions: [] },
  { id: "recommendations", visible: true, collapsed: false, roles: ["manager"], sortOrder: 3, permissions: [] },
  { id: "operational_intelligence", visible: true, collapsed: false, roles: ["manager"], sortOrder: 4, permissions: [] },
  { id: "quick_decision_bar", visible: true, collapsed: false, roles: ["manager"], sortOrder: 5, permissions: [] },
  { id: "business_context", visible: true, collapsed: false, roles: ["nurse", "manager"], sortOrder: 6, permissions: [] },
  { id: "mini_kpis", visible: true, collapsed: false, roles: ["manager"], sortOrder: 7, permissions: [] },
  { id: "floating_copilot", visible: true, collapsed: false, roles: ["manager"], sortOrder: 8, permissions: [] },
];

export const SEED_COPILOT_CAPABILITIES: OperationsCopilotCapabilityConfig[] = [
  { id: "cp_1", labelKey: "copilot.summarize", promptKey: "summarize" },
  { id: "cp_2", labelKey: "copilot.explainTimeline", promptKey: "explain_timeline" },
  { id: "cp_3", labelKey: "copilot.answer", promptKey: "answer" },
  { id: "cp_4", labelKey: "copilot.followUp", promptKey: "follow_up" },
  { id: "cp_5", labelKey: "copilot.whatsapp", promptKey: "whatsapp" },
  { id: "cp_6", labelKey: "copilot.email", promptKey: "email" },
  { id: "cp_7", labelKey: "copilot.note", promptKey: "note" },
  { id: "cp_8", labelKey: "copilot.risk", promptKey: "risk" },
  { id: "cp_9", labelKey: "copilot.nextAction", promptKey: "next_action" },
];

export const SEED_BUSINESS_CONTEXT_BY_TEMPLATE: Record<string, OperationsBusinessContextConfig> = {
  clinic: {
    fields: [
      { key: "patient", label: "Patient", icon: "User", valueBinding: "customer.name" },
      { key: "doctor", label: "Doctor", icon: "Stethoscope", valueBinding: "todaysOperation.assignedEmployee" },
      { key: "allergies", label: "Allergies", icon: "AlertTriangle", valueBinding: "static", staticValue: "" },
      { key: "medical_notes", label: "Medical Notes", icon: "FileText", valueBinding: "static", staticValue: "" },
      { key: "insurance", label: "Insurance", icon: "Shield", valueBinding: "static", staticValue: "" },
    ],
    currentJourneyStepId: "doctor",
  },
  training_center: {
    fields: [
      { key: "student", label: "Student", icon: "GraduationCap", valueBinding: "customer.name" },
      { key: "instructor", label: "Instructor", icon: "UserCheck", valueBinding: "todaysOperation.assignedEmployee" },
      { key: "course", label: "Course", icon: "BookOpen", valueBinding: "static", staticValue: "" },
      { key: "attendance", label: "Attendance", icon: "CheckCircle", valueBinding: "static", staticValue: "" },
    ],
    currentJourneyStepId: "session",
  },
  automotive: {
    fields: [
      { key: "vehicle", label: "Vehicle", icon: "Car", valueBinding: "static", staticValue: "" },
      { key: "mileage", label: "Mileage", icon: "Gauge", valueBinding: "static", staticValue: "" },
      { key: "vin", label: "VIN", icon: "Hash", valueBinding: "static", staticValue: "" },
      { key: "warranty", label: "Warranty", icon: "Shield", valueBinding: "static", staticValue: "" },
    ],
    currentJourneyStepId: "waiting",
  },
};
