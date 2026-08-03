import type { OperationsQueueColumnKey, OperationsWorkflowAction } from "../constants.js";

export type BusinessTemplateKey =
  | "clinic"
  | "salon"
  | "dental_clinic"
  | "hospital"
  | "car_service"
  | "real_estate"
  | "software_company"
  | "gym"
  | "law_firm"
  | "education"
  | "default";

export type WorkspaceLabelOverrides = Partial<
  Record<
    | "patient"
    | "doctor"
    | "service"
    | "queue"
    | "payment"
    | "appointment"
    | "customer"
    | "resource"
    | "branch",
    string
  >
>;

export type OperationsWorkspaceConfig = {
  id: string;
  companyId: string;
  workspaceName: string;
  templateKey: BusinessTemplateKey;
  labelOverrides: WorkspaceLabelOverrides;
  visibleColumns: OperationsQueueColumnKey[];
  columnOrder: OperationsQueueColumnKey[];
  defaultFilters: Record<string, unknown>;
  availableActions: OperationsWorkflowAction[];
  theme: { accent?: string; icon?: string };
  updatedAt: string;
};

export type OperationsUserPreferences = {
  userId: string;
  companyId: string;
  columns: OperationsQueueColumnKey[];
  filters: Record<string, unknown>;
  sorting: { column: OperationsQueueColumnKey; direction: "asc" | "desc" };
  density: "compact" | "comfortable" | "spacious";
  grouping: string | null;
  defaultWorkspace: boolean;
};

export type OperationsSavedView = {
  id: string;
  companyId: string;
  userId: string;
  name: string;
  columns: OperationsQueueColumnKey[];
  filters: Record<string, unknown>;
  sorting: { column: OperationsQueueColumnKey; direction: "asc" | "desc" };
  isShared: boolean;
};

export type ServiceCatalogItem = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  taxPercent: number;
  requiresResource: boolean;
  requiresAppointment: boolean;
  bookableOnline: boolean;
  color: string | null;
  active: boolean;
};
