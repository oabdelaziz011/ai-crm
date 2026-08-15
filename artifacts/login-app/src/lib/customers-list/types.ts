import type { Booking, Customer } from "@/lib/types";

export type CustomerListDensity = "comfortable" | "compact" | "ultra";

export type CustomerListStatus = "active" | "inactive" | "at_risk" | "new";

export type CustomerColumnId =
  | "select"
  | "customer"
  | "tags"
  | "company"
  | "phone"
  | "email"
  | "assigned"
  | "nextAppointment"
  | "outstanding"
  | "ltv"
  | "status"
  | "lastActivity"
  | "actions";

export type CustomerSortField =
  | "name"
  | "company"
  | "created_at"
  | "ltv"
  | "outstanding"
  | "lastActivity"
  | "nextAppointment";

export type SortDirection = "asc" | "desc";

export type CustomerListFilters = {
  status: CustomerListStatus | "all";
  vip: boolean | null;
  assignedEmployee: string;
  branch: string;
  gender: string;
  ageMin: number | null;
  ageMax: number | null;
  source: string;
  tags: string[];
  outstandingMin: number | null;
  outstandingMax: number | null;
  lastVisitFrom: string | null;
  lastVisitTo: string | null;
  registeredFrom: string | null;
  registeredTo: string | null;
  appointmentFrom: string | null;
  appointmentTo: string | null;
};

export type SavedViewDefinition = {
  id: string;
  labelKey: string;
  builtIn?: boolean;
  filters?: Partial<CustomerListFilters>;
  sortField?: CustomerSortField;
  sortDirection?: SortDirection;
  search?: string;
};

export type CustomSavedView = {
  id: string;
  label: string;
  builtIn?: false;
  filters?: Partial<CustomerListFilters>;
  sortField?: CustomerSortField;
  sortDirection?: SortDirection;
  search?: string;
};

export type CustomerSavedView = SavedViewDefinition | CustomSavedView;

export function isCustomSavedView(view: CustomerSavedView): view is CustomSavedView {
  return "label" in view;
}

export type EnrichedCustomerRow = {
  customer: Customer;
  ltv: number;
  outstanding: number;
  bookingCount: number;
  isVip: boolean;
  tags: string[];
  status: CustomerListStatus;
  company: string | null;
  assignedEmployee: string | null;
  branch: string | null;
  source: string;
  nextAppointment: Booking | null;
  lastActivity: string | null;
  lastVisit: Booking | null;
  hasAppointmentToday: boolean;
  needsFollowUp: boolean;
};

export type CustomerListPreferences = {
  density: CustomerListDensity;
  columnOrder: CustomerColumnId[];
  columnVisibility: Record<CustomerColumnId, boolean>;
  columnWidths: Partial<Record<CustomerColumnId, number>>;
  sortField: CustomerSortField;
  sortDirection: SortDirection;
  customViews: CustomSavedView[];
};

export const DENSITY_ROW_HEIGHT: Record<CustomerListDensity, number> = {
  comfortable: 56,
  compact: 44,
  ultra: 36,
};

export const DEFAULT_COLUMN_ORDER: CustomerColumnId[] = [
  "select",
  "customer",
  "tags",
  "company",
  "phone",
  "email",
  "assigned",
  "nextAppointment",
  "outstanding",
  "ltv",
  "status",
  "lastActivity",
  "actions",
];

export const DEFAULT_COLUMN_WIDTHS: Partial<Record<CustomerColumnId, number>> = {
  select: 44,
  customer: 220,
  tags: 140,
  company: 130,
  phone: 130,
  email: 180,
  assigned: 140,
  nextAppointment: 140,
  outstanding: 110,
  ltv: 110,
  status: 100,
  lastActivity: 120,
  actions: 52,
};

export const DEFAULT_COLUMN_VISIBILITY: Record<CustomerColumnId, boolean> = {
  select: true,
  customer: true,
  tags: true,
  company: true,
  phone: true,
  email: true,
  assigned: false,
  nextAppointment: true,
  outstanding: true,
  ltv: true,
  status: true,
  lastActivity: true,
  actions: true,
};

export function createDefaultFilters(): CustomerListFilters {
  return {
    status: "all",
    vip: null,
    assignedEmployee: "all",
    branch: "all",
    gender: "all",
    ageMin: null,
    ageMax: null,
    source: "all",
    tags: [],
    outstandingMin: null,
    outstandingMax: null,
    lastVisitFrom: null,
    lastVisitTo: null,
    registeredFrom: null,
    registeredTo: null,
    appointmentFrom: null,
    appointmentTo: null,
  };
}
