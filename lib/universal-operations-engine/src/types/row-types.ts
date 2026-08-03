export type OperationsRowValue = string | number | boolean | null | string[];

export type OperationsRow = {
  id: string;
  companyId: string;
  customerId: string | null;
  leadId: string | null;
  statusId: string;
  paymentStatusId: string;
  assignedResourceId: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  tags: string[];
  values: Record<string, OperationsRowValue>;
  createdAt: string;
  updatedAt: string;
};

export type OperationsQueuePage = {
  rows: OperationsRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type OperationsQueueQuery = {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  sort?: Array<{ columnId: string; direction: "asc" | "desc" }>;
  filters?: Record<string, unknown>;
  viewId?: string;
};

export type OperationsSortState = {
  columnId: string;
  direction: "asc" | "desc";
};

export type OperationsFilterState = Record<string, unknown>;

export type OperationsGridPreferences = {
  columnWidths: Record<string, number>;
  columnOrder: string[];
  pinnedColumns: Record<string, "left" | "right" | null>;
  hiddenColumnIds: string[];
  density: "compact" | "comfortable" | "spacious";
};
