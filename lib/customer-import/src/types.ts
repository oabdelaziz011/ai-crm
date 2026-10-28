export type CustomerImportTargetFieldId =
  | "name"
  | "email"
  | "phone"
  | "phone_region"
  | "gender"
  | "date_of_birth"
  | "notes"
  | "company_name"
  | "source";

export type CustomerImportFieldDefinition = {
  id: CustomerImportTargetFieldId;
  required: boolean;
  labelKey: string;
  descriptionKey: string;
  valueType: "string" | "email" | "phone" | "date" | "enum";
  maxLength?: number;
  enumValues?: readonly string[];
  aliases: readonly string[];
};

export type CustomerImportDuplicatePolicy = "skip" | "update" | "flag";

export type CustomerImportSourceKind = "csv_xlsx" | "connector_planned";

export type ParsedSourceColumn = {
  index: number;
  header: string;
  samples: string[];
};

export type ParsedWorksheet = {
  name: string;
  index: number;
  rowCount: number;
};

export type ParsedImportWorkbook = {
  sourceKind: "csv" | "xlsx";
  fileName: string;
  fileSizeBytes: number;
  worksheets: ParsedWorksheet[];
  selectedSheetIndex: number;
  columns: ParsedSourceColumn[];
  /** All data rows (excluding header). Values keyed by column index as string. */
  rows: Array<Record<string, string>>;
  warnings: Array<{ code: string; message: string }>;
};

export type FieldMappingConfidence = "exact" | "alias" | "none";

export type FieldMappingEntry = {
  sourceColumnIndex: number;
  sourceHeader: string;
  targetFieldId: CustomerImportTargetFieldId | null;
  ignored: boolean;
  confidence: FieldMappingConfidence;
  reason?: string;
};

export type CustomerImportRowIssue = {
  rowNumber: number;
  field: string | null;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type NormalizedImportRow = {
  rowNumber: number;
  values: Partial<Record<CustomerImportTargetFieldId, string>>;
  issues: CustomerImportRowIssue[];
};

export type DuplicateMatchKind = "email" | "phone_e164" | "file_internal";

export type DuplicateCandidate = {
  rowNumber: number;
  matchKind: DuplicateMatchKind;
  existingCustomerId?: string;
  matchedValue: string;
  policyAction: "skip" | "update" | "flag" | "create";
};

export type CustomerImportValidationSummary = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  duplicateCandidates: number;
  expectedInserts: number;
  expectedUpdates: number;
  expectedSkips: number;
  expectedFlags: number;
  unmappedColumns: string[];
};

export type CustomerImportJobStatus =
  | "draft"
  | "parsed"
  | "mapped"
  | "validated"
  | "confirming"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export type CustomerImportRowOutcomeStatus =
  | "pending"
  | "created"
  | "updated"
  | "skipped"
  | "flagged"
  | "invalid"
  | "failed";
