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
  col({ id: "col_ref", internalName: "reference", displayName: "Reference", icon: "Hash", type: "text", visible: true, required: true, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: true, width: 120, alignment: "start", permissions: [], position: 0, pinned: "left" }),
  col({ id: "col_customer", internalName: "customer", displayName: "Patient", icon: "User", type: "customer", visible: true, required: true, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: true, width: 200, alignment: "start", permissions: [], position: 1, pinned: "left" }),
  col({ id: "col_phone", internalName: "phone", displayName: "Phone", icon: "Phone", type: "phone", visible: true, required: false, sortable: false, filterable: true, searchable: true, exportable: true, reportable: false, aiIndexed: false, width: 140, alignment: "start", permissions: [], position: 2 }),
  col({ id: "col_service", internalName: "service", displayName: "Service", icon: "Stethoscope", type: "lookup", visible: true, required: false, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: true, width: 160, alignment: "start", permissions: [], position: 3 }),
  col({ id: "col_resource", internalName: "resource", displayName: "Doctor", icon: "UserCog", type: "resource", visible: true, required: false, sortable: true, filterable: true, searchable: true, exportable: true, reportable: true, aiIndexed: false, width: 150, alignment: "start", permissions: [], position: 4 }),
  col({ id: "col_status", internalName: "status", displayName: "Status", icon: "CircleDot", type: "status", visible: true, required: true, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 130, alignment: "center", permissions: [], position: 5 }),
  col({ id: "col_payment", internalName: "payment_status", displayName: "Payment", icon: "CreditCard", type: "payment", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 120, alignment: "center", permissions: ["operations.payment.collect"], position: 6 }),
  col({ id: "col_scheduled", internalName: "scheduled_at", displayName: "Scheduled", icon: "Calendar", type: "datetime", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 170, alignment: "start", permissions: [], position: 7 }),
  col({ id: "col_waiting", internalName: "waiting_minutes", displayName: "Waiting", icon: "Clock", type: "number", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 100, alignment: "end", permissions: [], position: 8 }),
  col({ id: "col_amount", internalName: "amount", displayName: "Amount", icon: "DollarSign", type: "currency", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 110, alignment: "end", permissions: ["operations.revenue.view"], position: 9 }),
  col({ id: "col_tags", internalName: "tags", displayName: "Tags", icon: "Tags", type: "tags", visible: false, required: false, sortable: false, filterable: true, searchable: true, exportable: true, reportable: false, aiIndexed: true, width: 160, alignment: "start", permissions: [], position: 10 }),
  col({ id: "col_branch", internalName: "branch", displayName: "Branch", icon: "Building2", type: "branch", visible: true, required: false, sortable: true, filterable: true, searchable: false, exportable: true, reportable: true, aiIndexed: false, width: 130, alignment: "start", permissions: [], position: 11 }),
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
