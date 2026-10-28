import type { CustomerImportTargetFieldId } from "./types.js";

export const CUSTOMER_IMPORT_LOCALES = ["en", "ar"] as const;
export type CustomerImportLocale = (typeof CUSTOMER_IMPORT_LOCALES)[number];

export type CustomerImportTemplateMessages = {
  sheetCustomers: string;
  sheetInstructions: string;
  title: string;
  requiredFields: string;
  optionalFields: string;
  emptyCells: string;
  emptyCellsHint: string;
  phoneNumbers: string;
  phoneNumbersHint: string;
  email: string;
  emailHint: string;
  sourceValues: string;
  dates: string;
  datesHint: string;
  exampleRows: string;
  exampleRowsHint: string;
  supportedFiles: string;
  supportedFilesHint: string;
  exampleNotes: string;
  exampleNameSara: string;
  exampleNameOmar: string;
  /** Localized display headers keyed by stable field id. */
  fieldHeaders: Record<CustomerImportTargetFieldId, string>;
};

/**
 * Template copy catalog (mirrors login-app `customerImport.template` + field labels).
 * Kept in-package so the API can generate localized XLSX without bundling the UI app.
 */
export const CUSTOMER_IMPORT_TEMPLATE_MESSAGES: Record<
  CustomerImportLocale,
  CustomerImportTemplateMessages
> = {
  en: {
    sheetCustomers: "Customers",
    sheetInstructions: "Instructions",
    title: "ValueOR Customer Import Template",
    requiredFields: "Required fields",
    optionalFields: "Optional fields",
    emptyCells: "Empty cells",
    emptyCellsHint: "Optional fields may be left blank.",
    phoneNumbers: "Phone numbers",
    phoneNumbersHint:
      "Prefer E.164 (+2010...). Local numbers need phone region (ISO-2, e.g. EG).",
    email: "Email",
    emailHint: "Must be a valid email address when provided.",
    sourceValues: "Source values",
    dates: "Dates",
    datesHint: "Use YYYY-MM-DD.",
    exampleRows: "Example rows",
    exampleRowsHint: "Rows marked as examples are samples. Delete them before importing.",
    supportedFiles: "Supported files",
    supportedFilesHint:
      "CSV (UTF-8) and XLSX. Maximum 5 MB / 2000 data rows in this release.",
    exampleNotes: "Example row — delete before import",
    exampleNameSara: "EXAMPLE — Sara Example",
    exampleNameOmar: "EXAMPLE — Omar Example",
    fieldHeaders: {
      name: "Customer name",
      email: "Email",
      phone: "Phone",
      phone_region: "Phone region",
      gender: "Gender",
      date_of_birth: "Date of birth",
      notes: "Notes",
      company_name: "Company",
      source: "Source",
    },
  },
  ar: {
    sheetCustomers: "العملاء",
    sheetInstructions: "التعليمات",
    title: "قالب استيراد عملاء ValueOR",
    requiredFields: "الحقول المطلوبة",
    optionalFields: "الحقول الاختيارية",
    emptyCells: "الخلايا الفارغة",
    emptyCellsHint: "يمكن ترك الحقول الاختيارية فارغة.",
    phoneNumbers: "أرقام الهاتف",
    phoneNumbersHint:
      "يفضّل E.164 (+2010...). الأرقام المحلية تحتاج منطقة هاتف (ISO-2 مثل EG).",
    email: "البريد الإلكتروني",
    emailHint: "يجب أن يكون بريدًا صالحًا عند توفره.",
    sourceValues: "قيم المصدر",
    dates: "التواريخ",
    datesHint: "استخدم YYYY-MM-DD.",
    exampleRows: "صفوف الأمثلة",
    exampleRowsHint: "الصفوف المعلّمة كأمثلة هي عينات. احذفها قبل الاستيراد.",
    supportedFiles: "الملفات المدعومة",
    supportedFilesHint:
      "CSV (UTF-8) وXLSX. الحد الأقصى 5 ميجابايت / 2000 صف في هذا الإصدار.",
    exampleNotes: "صف مثال — احذفه قبل الاستيراد",
    exampleNameSara: "مثال — سارة تجريبية",
    exampleNameOmar: "مثال — عمر تجريبي",
    fieldHeaders: {
      name: "اسم العميل",
      email: "البريد الإلكتروني",
      phone: "الهاتف",
      phone_region: "منطقة الهاتف",
      gender: "النوع",
      date_of_birth: "تاريخ الميلاد",
      notes: "ملاحظات",
      company_name: "الشركة",
      source: "المصدر",
    },
  },
};

export function resolveCustomerImportLocale(
  value: string | null | undefined,
): CustomerImportLocale {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("ar")) return "ar";
  if (normalized.startsWith("en")) return "en";
  return "en";
}

export function getCustomerImportTemplateMessages(
  locale: string | null | undefined,
): CustomerImportTemplateMessages {
  return CUSTOMER_IMPORT_TEMPLATE_MESSAGES[resolveCustomerImportLocale(locale)];
}

/** All localized display headers across locales (for alias matching). */
export function listLocalizedImportHeaderAliases(
  fieldId: CustomerImportTargetFieldId,
): string[] {
  return CUSTOMER_IMPORT_LOCALES.map(
    (locale) => CUSTOMER_IMPORT_TEMPLATE_MESSAGES[locale].fieldHeaders[fieldId],
  );
}
