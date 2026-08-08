import type { OperationsColumnDefinition } from "../types/metadata-types.js";

const col = (
  partial: Omit<OperationsColumnDefinition, "validation" | "defaultValue"> & {
    defaultValue?: OperationsColumnDefinition["defaultValue"];
    validation?: OperationsColumnDefinition["validation"];
  },
): OperationsColumnDefinition => ({
  validation: null,
  defaultValue: null,
  pinned: null,
  ...partial,
});

export const CLINIC_COLUMNS: OperationsColumnDefinition[] = [
  col({ id: "col_queue_number", internalName: "queue_number", displayName: "#", icon: "Hash", type: "number", visible: true, required: false, sortable: false, filterable: false, searchable: false, exportable: true, reportable: false, aiIndexed: false, width: 56, alignment: "center", permissions: [], position: 0, pinned: "left" }),
  col({ id: "col_ref", internalName: "reference", displayName: "Reference", icon: "Hash", type: "text", visible: true, required: true, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: true, width: 110, alignment: "start", permissions: [], position: 1, pinned: "left" }),
  col({ id: "col_appointment_time", internalName: "appointment_time", displayName: "Appointment Time", icon: "Clock", type: "datetime", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 120, alignment: "start", permissions: [], position: 2 }),
  col({ id: "col_customer", internalName: "customer", displayName: "Patient", icon: "User", type: "customer", visible: true, required: true, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: true, width: 160, alignment: "start", permissions: [], position: 3, pinned: "left" }),
  col({ id: "col_visit_type", internalName: "visit_type", displayName: "Visit Type", icon: "BadgeCheck", type: "tags", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 120, alignment: "center", permissions: [], position: 4 }),
  col({ id: "col_phone", internalName: "phone", displayName: "Phone", icon: "Phone", type: "phone", visible: true, required: false, sortable: false, filterable: true, searchable: true, exportable: true, reportable: false, aiIndexed: false, width: 130, alignment: "start", permissions: [], position: 5 }),
  col({ id: "col_service", internalName: "service", displayName: "Service", icon: "Stethoscope", type: "lookup", visible: true, required: false, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: true, width: 150, alignment: "start", permissions: [], position: 6 }),
  col({ id: "col_resource", internalName: "resource", displayName: "Doctor", icon: "UserCog", type: "resource", visible: true, required: false, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: false, width: 150, alignment: "start", permissions: [], position: 7 }),
  col({ id: "col_status", internalName: "status", displayName: "Status", icon: "CircleDot", type: "status", visible: true, required: true, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 120, alignment: "center", permissions: [], position: 8 }),
  col({ id: "col_waiting", internalName: "waiting_minutes", displayName: "Waiting Time", icon: "Clock", type: "number", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 110, alignment: "end", permissions: [], position: 9 }),
  col({ id: "col_duration", internalName: "duration_minutes", displayName: "Duration", icon: "Timer", type: "number", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 90, alignment: "end", permissions: [], position: 10 }),
  col({ id: "col_payment", internalName: "payment_status", displayName: "Payment Status", icon: "CreditCard", type: "payment", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 120, alignment: "center", permissions: ["operations.payment.collect"], position: 11 }),
  col({ id: "col_scheduled", internalName: "scheduled_at", displayName: "Scheduled", icon: "Calendar", type: "datetime", visible: false, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 170, alignment: "start", permissions: [], position: 12 }),
  col({ id: "col_amount", internalName: "amount", displayName: "Amount", icon: "DollarSign", type: "currency", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 100, alignment: "end", permissions: ["operations.revenue.view"], position: 13 }),
  col({ id: "col_tags", internalName: "tags", displayName: "Tags", icon: "Tags", type: "tags", visible: false, required: false, sortable: false, filterable: true, searchable: true, exportable: true, reportable: false, aiIndexed: true, width: 160, alignment: "start", permissions: [], position: 14 }),
  col({ id: "col_branch", internalName: "branch", displayName: "Branch", icon: "Building2", type: "branch", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 120, alignment: "start", permissions: [], position: 15 }),
  col({ id: "col_actions", internalName: "actions", displayName: "Actions", icon: "MoreHorizontal", type: "text", visible: true, required: false, sortable: false, filterable: false, searchable: false, exportable: false, reportable: false, aiIndexed: false, width: 56, alignment: "center", permissions: [], position: 16, pinned: "right" }),
];

export const TRAINING_COLUMNS: OperationsColumnDefinition[] = CLINIC_COLUMNS.map((column, index) => {
  if (column.internalName === "customer") return { ...column, id: "col_student", displayName: "Student", icon: "GraduationCap" };
  if (column.internalName === "resource") return { ...column, id: "col_instructor", displayName: "Instructor", icon: "UserCheck" };
  if (column.internalName === "service") return { ...column, id: "col_course", displayName: "Course", icon: "BookOpen" };
  return { ...column, position: index };
});

export const AUTOMOTIVE_COLUMNS: OperationsColumnDefinition[] = CLINIC_COLUMNS.map((column, index) => {
  if (column.internalName === "customer") return { ...column, displayName: "Customer" };
  if (column.internalName === "resource") return { ...column, displayName: "Technician", icon: "Wrench" };
  if (column.internalName === "service") return { ...column, displayName: "Repair Type", icon: "Car" };
  return { ...column, position: index };
});
