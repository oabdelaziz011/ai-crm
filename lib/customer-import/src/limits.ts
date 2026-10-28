/** Bounded first-release limits. Documented for operators. */
export const CUSTOMER_IMPORT_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 2_000,
  previewRows: 25,
  batchSize: 50,
  maxHeaderColumns: 64,
  retentionDays: 14,
} as const;

export const CUSTOMER_IMPORT_ALLOWED_MIME = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
] as const;

export const CUSTOMER_IMPORT_ALLOWED_EXTENSIONS = [".csv", ".xlsx"] as const;
