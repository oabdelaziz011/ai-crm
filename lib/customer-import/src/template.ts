import ExcelJS from "exceljs";
import { CUSTOMER_IMPORT_FIELDS, CUSTOMER_ACQUISITION_SOURCES } from "./fields.js";
import {
  getCustomerImportTemplateMessages,
  resolveCustomerImportLocale,
  type CustomerImportLocale,
} from "./template-i18n.js";

export type BuildCustomerImportTemplateOptions = {
  locale?: string | null;
};

/** Generate a real XLSX template from the authoritative field catalog + locale messages. */
export async function buildCustomerImportTemplateBuffer(
  options: BuildCustomerImportTemplateOptions = {},
): Promise<Buffer> {
  const locale = resolveCustomerImportLocale(options.locale);
  const messages = getCustomerImportTemplateMessages(locale);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ValueOR";
  workbook.created = new Date();

  const dataSheet = workbook.addWorksheet(messages.sheetCustomers);
  const headers = CUSTOMER_IMPORT_FIELDS.map(
    (field) => messages.fieldHeaders[field.id] ?? field.id,
  );
  dataSheet.addRow(headers);
  dataSheet.getRow(1).font = { bold: true };

  // Example rows — clearly marked so operators do not treat them as live data.
  dataSheet.addRow([
    messages.exampleNameSara,
    "sara.example@example.com",
    "+201000000001",
    "EG",
    "female",
    "1990-01-15",
    messages.exampleNotes,
    locale === "ar" ? "شركة تجريبية" : "Example Co",
    "manual",
  ]);
  dataSheet.addRow([
    messages.exampleNameOmar,
    "omar.example@example.com",
    "+201000000002",
    "EG",
    "male",
    "1988-06-20",
    messages.exampleNotes,
    locale === "ar" ? "مؤسسة تجريبية" : "Demo Org",
    "website",
  ]);

  dataSheet.columns = headers.map(() => ({ width: 22 }));

  const instructions = workbook.addWorksheet(messages.sheetInstructions);
  instructions.addRow([messages.title]);
  instructions.addRow([]);
  instructions.addRow([
    messages.requiredFields,
    CUSTOMER_IMPORT_FIELDS.filter((field) => field.required)
      .map((field) => `${messages.fieldHeaders[field.id]} (${field.id})`)
      .join(", "),
  ]);
  instructions.addRow([
    messages.optionalFields,
    CUSTOMER_IMPORT_FIELDS.filter((field) => !field.required)
      .map((field) => `${messages.fieldHeaders[field.id]} (${field.id})`)
      .join(", "),
  ]);
  instructions.addRow([]);
  instructions.addRow([messages.emptyCells, messages.emptyCellsHint]);
  instructions.addRow([messages.phoneNumbers, messages.phoneNumbersHint]);
  instructions.addRow([messages.email, messages.emailHint]);
  instructions.addRow([messages.sourceValues, CUSTOMER_ACQUISITION_SOURCES.join(", ")]);
  instructions.addRow([messages.dates, messages.datesHint]);
  instructions.addRow([messages.exampleRows, messages.exampleRowsHint]);
  instructions.addRow([messages.supportedFiles, messages.supportedFilesHint]);
  instructions.columns = [{ width: 22 }, { width: 90 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function templateFileNameForLocale(locale: CustomerImportLocale | string): string {
  const resolved = resolveCustomerImportLocale(locale);
  return resolved === "ar"
    ? "valueor-customer-import-template-ar.xlsx"
    : "valueor-customer-import-template-en.xlsx";
}

/**
 * Detect template sample rows in EN (`EXAMPLE`) or AR (`مثال`) without
 * dropping ordinary customer names that merely contain those words later.
 */
export function isExampleImportRow(values: { name?: string | null }): boolean {
  const name = values.name?.trim() ?? "";
  if (!name) return false;
  return (
    /^example\b/i.test(name) ||
    name.startsWith("EXAMPLE") ||
    /^مثال(?:\s|[—\-–]|$)/.test(name)
  );
}
