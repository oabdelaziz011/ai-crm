import type {
  OperationsPaymentStatusDefinition,
  OperationsResourceDefinition,
  OperationsServiceDefinition,
  OperationsStatusDefinition,
  OperationsStatusTransition,
  OperationsWorkspaceConfig,
} from "../types/metadata-types.js";
import { AUTOMOTIVE_COLUMNS, CLINIC_COLUMNS, TRAINING_COLUMNS } from "./mock-columns.js";

const CLINIC_STATUSES: OperationsStatusDefinition[] = [
  { id: "st_booked", internalName: "booked", displayName: "Booked", color: "#6366f1", icon: "Calendar", isTerminal: false, sortOrder: 0, permissions: [] },
  { id: "st_confirmed", internalName: "confirmed", displayName: "Confirmed", color: "#3b82f6", icon: "CheckCircle", isTerminal: false, sortOrder: 1, permissions: [] },
  { id: "st_checked_in", internalName: "checked_in", displayName: "Checked In", color: "#0ea5e9", icon: "LogIn", isTerminal: false, sortOrder: 2, permissions: ["operations.queue.checkin"] },
  { id: "st_in_progress", internalName: "in_progress", displayName: "In Progress", color: "#f59e0b", icon: "Activity", isTerminal: false, sortOrder: 3, permissions: [] },
  { id: "st_completed", internalName: "completed", displayName: "Completed", color: "#22c55e", icon: "CheckCheck", isTerminal: true, sortOrder: 4, permissions: ["operations.queue.complete"] },
  { id: "st_archived", internalName: "archived", displayName: "Archived", color: "#64748b", icon: "Archive", isTerminal: true, sortOrder: 5, permissions: [] },
];

const CLINIC_TRANSITIONS: OperationsStatusTransition[] = [
  { fromStatusId: "st_booked", toStatusId: "st_confirmed" },
  { fromStatusId: "st_confirmed", toStatusId: "st_checked_in" },
  { fromStatusId: "st_checked_in", toStatusId: "st_in_progress" },
  { fromStatusId: "st_in_progress", toStatusId: "st_completed" },
  { fromStatusId: "st_completed", toStatusId: "st_archived" },
];

const PAYMENT_STATUSES: OperationsPaymentStatusDefinition[] = [
  { id: "pay_unpaid", internalName: "unpaid", displayName: "Unpaid", color: "#ef4444", sortOrder: 0 },
  { id: "pay_partial", internalName: "partial", displayName: "Partial", color: "#f59e0b", sortOrder: 1 },
  { id: "pay_paid", internalName: "paid", displayName: "Paid", color: "#22c55e", sortOrder: 2 },
  { id: "pay_refunded", internalName: "refunded", displayName: "Refunded", color: "#64748b", sortOrder: 3 },
];

const SERVICES: OperationsServiceDefinition[] = [
  { id: "svc_consult", name: "Consultation", priceCents: 15000, durationMinutes: 30, vatPercent: 15, resourceIds: ["res_dr_a", "res_dr_b"], color: "#6366f1", capacity: 1, onlineBooking: true, cancellationPolicy: "24h notice", bufferMinutes: 10, active: true },
  { id: "svc_followup", name: "Follow-up", priceCents: 8000, durationMinutes: 20, vatPercent: 15, resourceIds: ["res_dr_a"], color: "#0ea5e9", capacity: 1, onlineBooking: true, cancellationPolicy: "12h notice", bufferMinutes: 5, active: true },
];

const RESOURCES: OperationsResourceDefinition[] = [
  { id: "res_dr_a", name: "Dr. Amira Hassan", type: "doctor", branchId: "br_main", color: "#6366f1", active: true },
  { id: "res_dr_b", name: "Dr. Omar Khalil", type: "doctor", branchId: "br_main", color: "#8b5cf6", active: true },
  { id: "res_room_1", name: "Room 1", type: "room", branchId: "br_main", color: "#64748b", active: true },
];

function buildConfig(
  templateKey: string,
  workspaceName: string,
  moduleName: string,
  rowEntityName: string,
  terminology: OperationsWorkspaceConfig["terminology"],
  columns: OperationsWorkspaceConfig["columns"],
): OperationsWorkspaceConfig {
  return {
    id: `cfg_${templateKey}`,
    companyId: "mock-company",
    templateKey,
    workspaceName,
    moduleName,
    rowEntityName,
    terminology,
    branding: { accentColor: "#6366f1", icon: "LayoutGrid", moduleIcon: "Briefcase" },
    columns,
    statuses: CLINIC_STATUSES,
    statusTransitions: CLINIC_TRANSITIONS,
    paymentStatuses: PAYMENT_STATUSES,
    services: SERVICES,
    resources: RESOURCES,
    updatedAt: new Date().toISOString(),
  };
}

export const MOCK_CLINIC_CONFIG = buildConfig(
  "clinic",
  "Front Desk Operations",
  "Operations",
  "Visit",
  { customer: "Patient", resource: "Doctor", service: "Service", queue: "Waiting List", payment: "Payment", appointment: "Appointment" },
  CLINIC_COLUMNS,
);

export const MOCK_TRAINING_CONFIG = buildConfig(
  "training_center",
  "Training Operations",
  "Operations",
  "Session",
  { customer: "Student", resource: "Instructor", service: "Course", queue: "Session Queue", payment: "Tuition", appointment: "Session" },
  TRAINING_COLUMNS,
);

export const MOCK_AUTOMOTIVE_CONFIG = buildConfig(
  "automotive",
  "Service Bay Operations",
  "Operations",
  "Repair Job",
  { customer: "Customer", resource: "Technician", service: "Repair Type", queue: "Service Queue", payment: "Payment", appointment: "Job" },
  AUTOMOTIVE_COLUMNS,
);

export const MOCK_WORKSPACE_CONFIGS = [MOCK_CLINIC_CONFIG, MOCK_TRAINING_CONFIG, MOCK_AUTOMOTIVE_CONFIG];

export function getMockWorkspaceConfig(templateKey = "clinic"): OperationsWorkspaceConfig {
  return MOCK_WORKSPACE_CONFIGS.find((c) => c.templateKey === templateKey) ?? MOCK_CLINIC_CONFIG;
}
