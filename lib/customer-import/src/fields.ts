import { listLocalizedImportHeaderAliases } from "./template-i18n.js";
import type { CustomerImportFieldDefinition, CustomerImportTargetFieldId } from "./types.js";

export const CUSTOMER_ACQUISITION_SOURCES = [
  "whatsapp",
  "messenger",
  "instagram",
  "email",
  "sms",
  "website",
  "manual",
  "other",
] as const;

function withLocalizedAliases(
  fieldId: CustomerImportTargetFieldId,
  aliases: readonly string[],
): readonly string[] {
  const localized = listLocalizedImportHeaderAliases(fieldId);
  return Array.from(new Set([...aliases, ...localized, fieldId]));
}

export const CUSTOMER_IMPORT_FIELDS: readonly CustomerImportFieldDefinition[] = [
  {
    id: "name",
    required: true,
    labelKey: "customerImport.fields.name.label",
    descriptionKey: "customerImport.fields.name.description",
    valueType: "string",
    maxLength: 200,
    aliases: withLocalizedAliases("name", [
      "name",
      "full name",
      "fullname",
      "customer",
      "customer name",
      "client name",
      "client",
      "contact name",
      "اسم",
      "اسم العميل",
      "الاسم",
    ]),
  },
  {
    id: "email",
    required: false,
    labelKey: "customerImport.fields.email.label",
    descriptionKey: "customerImport.fields.email.description",
    valueType: "email",
    maxLength: 320,
    aliases: withLocalizedAliases("email", [
      "email",
      "e-mail",
      "email address",
      "mail",
      "بريد",
      "البريد",
      "الايميل",
    ]),
  },
  {
    id: "phone",
    required: false,
    labelKey: "customerImport.fields.phone.label",
    descriptionKey: "customerImport.fields.phone.description",
    valueType: "phone",
    maxLength: 40,
    aliases: withLocalizedAliases("phone", [
      "phone",
      "phone number",
      "mobile",
      "mobile number",
      "cell",
      "cellphone",
      "whatsapp",
      "هاتف",
      "جوال",
      "موبايل",
      "رقم الهاتف",
    ]),
  },
  {
    id: "phone_region",
    required: false,
    labelKey: "customerImport.fields.phoneRegion.label",
    descriptionKey: "customerImport.fields.phoneRegion.description",
    valueType: "string",
    maxLength: 2,
    aliases: withLocalizedAliases("phone_region", [
      "region",
      "phone region",
      "country",
      "country code",
      "phone country",
      "iso",
      "phone_country_iso",
      "دولة",
      "رمز الدولة",
    ]),
  },
  {
    id: "gender",
    required: false,
    labelKey: "customerImport.fields.gender.label",
    descriptionKey: "customerImport.fields.gender.description",
    valueType: "string",
    maxLength: 40,
    aliases: withLocalizedAliases("gender", ["gender", "sex", "النوع", "الجنس"]),
  },
  {
    id: "date_of_birth",
    required: false,
    labelKey: "customerImport.fields.dateOfBirth.label",
    descriptionKey: "customerImport.fields.dateOfBirth.description",
    valueType: "date",
    aliases: withLocalizedAliases("date_of_birth", [
      "date of birth",
      "dob",
      "birthdate",
      "birthday",
      "تاريخ الميلاد",
    ]),
  },
  {
    id: "notes",
    required: false,
    labelKey: "customerImport.fields.notes.label",
    descriptionKey: "customerImport.fields.notes.description",
    valueType: "string",
    maxLength: 4000,
    aliases: withLocalizedAliases("notes", [
      "notes",
      "note",
      "comments",
      "comment",
      "ملاحظات",
      "ملاحظة",
    ]),
  },
  {
    id: "company_name",
    required: false,
    labelKey: "customerImport.fields.companyName.label",
    descriptionKey: "customerImport.fields.companyName.description",
    valueType: "string",
    maxLength: 200,
    aliases: withLocalizedAliases("company_name", [
      "company",
      "company name",
      "organization",
      "organisation",
      "organization name",
      "account name",
      "employer",
      "business",
      "شركة",
      "الشركة",
      "مؤسسة",
      "المؤسسة",
      "جهة العمل",
      "اسم الشركة",
    ]),
  },
  {
    id: "source",
    required: false,
    labelKey: "customerImport.fields.source.label",
    descriptionKey: "customerImport.fields.source.description",
    valueType: "enum",
    enumValues: CUSTOMER_ACQUISITION_SOURCES,
    aliases: withLocalizedAliases("source", [
      "source",
      "acquisition source",
      "lead source",
      "مصدر",
      "المصدر",
    ]),
  },
] as const;

export function getCustomerImportField(
  id: CustomerImportTargetFieldId,
): CustomerImportFieldDefinition {
  const field = CUSTOMER_IMPORT_FIELDS.find((entry) => entry.id === id);
  if (!field) throw new Error(`Unknown customer import field: ${id}`);
  return field;
}

export function listCustomerImportFields(): readonly CustomerImportFieldDefinition[] {
  return CUSTOMER_IMPORT_FIELDS;
}
