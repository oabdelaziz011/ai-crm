export { CUSTOMER_IMPORT_LIMITS, CUSTOMER_IMPORT_ALLOWED_EXTENSIONS, CUSTOMER_IMPORT_ALLOWED_MIME } from "./limits.js";
export {
  CUSTOMER_IMPORT_FIELDS,
  CUSTOMER_ACQUISITION_SOURCES,
  getCustomerImportField,
  listCustomerImportFields,
} from "./fields.js";
export { normalizeImportHeader } from "./normalize-header.js";
export { suggestFieldMappings, applyManualMapping, assertMappingReady } from "./map-fields.js";
export { parseCsvRecords, parseCustomerImportCsv } from "./parse-csv.js";
export { parseCustomerImportXlsx, listXlsxWorksheets } from "./parse-xlsx.js";
export { projectMappedRows, validateMappedRows, listUnmappedColumns } from "./validate.js";
export {
  buildExistingCustomerMatchIndex,
  detectDuplicateCandidates,
  type ExistingCustomerMatchIndex,
} from "./duplicates.js";
export { buildValidationSummary } from "./summary.js";
export { sanitizeSpreadsheetCell, buildErrorReportCsv } from "./sanitize-report.js";
export {
  buildCustomerImportTemplateBuffer,
  isExampleImportRow,
  templateFileNameForLocale,
} from "./template.js";
export {
  CUSTOMER_IMPORT_LOCALES,
  CUSTOMER_IMPORT_TEMPLATE_MESSAGES,
  getCustomerImportTemplateMessages,
  resolveCustomerImportLocale,
  type CustomerImportLocale,
  type CustomerImportTemplateMessages,
} from "./template-i18n.js";
export { buildCustomerImportRowIdempotencyKey } from "./idempotency.js";
export { CUSTOMER_IMPORT_CONNECTORS, type CustomerImportConnectorDescriptor } from "./connectors/registry.js";
export type * from "./types.js";

