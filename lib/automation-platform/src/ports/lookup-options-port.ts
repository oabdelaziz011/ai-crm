export type ListLookupRuntimeConfig = {
  lookup: string;
  displayField: string;
  valueField: string;
  filters?: Record<string, unknown>;
};

export type LookupListOptionRow = {
  id: string;
  title: string;
  description?: string;
  value?: string;
  record?: Record<string, unknown>;
};

export interface LookupOptionsPort {
  fetchListOptions(companyId: string, config: ListLookupRuntimeConfig): Promise<LookupListOptionRow[]>;
}
