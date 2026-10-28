import {
  isImportPhoneWritable,
  resolveImportPhoneIdentity,
} from "@workspace/ai-tool-router";
import { CUSTOMER_ACQUISITION_SOURCES, getCustomerImportField } from "./fields.js";
import { assertMappingReady } from "./map-fields.js";
import type {
  CustomerImportRowIssue,
  CustomerImportTargetFieldId,
  FieldMappingEntry,
  NormalizedImportRow,
  ParsedImportWorkbook,
} from "./types.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pushIssue(
  issues: CustomerImportRowIssue[],
  rowNumber: number,
  field: string | null,
  code: string,
  message: string,
  severity: "error" | "warning",
) {
  issues.push({ rowNumber, field, code, message, severity });
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (ISO_DATE_RE.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function projectMappedRows(
  workbook: ParsedImportWorkbook,
  mappings: FieldMappingEntry[],
): NormalizedImportRow[] {
  const ready = assertMappingReady(mappings);
  if (!ready.ok) {
    throw new Error(`${ready.code}: ${ready.message}`);
  }

  const active = mappings.filter((entry) => !entry.ignored && entry.targetFieldId);
  return workbook.rows.map((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const values: Partial<Record<CustomerImportTargetFieldId, string>> = {};
    for (const entry of active) {
      const raw = row[String(entry.sourceColumnIndex)] ?? "";
      if (!raw) continue;
      values[entry.targetFieldId!] = raw;
    }
    return { rowNumber, values, issues: [] };
  });
}

export function validateMappedRows(
  rows: NormalizedImportRow[],
  options: { defaultRegion?: string | null } = {},
): NormalizedImportRow[] {
  return rows.map((row) => {
    const issues: CustomerImportRowIssue[] = [];
    const values: Partial<Record<CustomerImportTargetFieldId, string>> = { ...row.values };

    const name = values.name?.trim() ?? "";
    if (!name) {
      pushIssue(issues, row.rowNumber, "name", "name_required", "Customer name is required.", "error");
    } else {
      const field = getCustomerImportField("name");
      if (field.maxLength && name.length > field.maxLength) {
        pushIssue(issues, row.rowNumber, "name", "name_too_long", "Customer name is too long.", "error");
      } else {
        values.name = name;
      }
    }

    if (values.email) {
      const email = values.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        pushIssue(issues, row.rowNumber, "email", "invalid_email", "Email format is invalid.", "error");
      } else {
        values.email = email;
      }
    }

    if (values.phone) {
      const preview = resolveImportPhoneIdentity({
        phone: values.phone,
        rowRegion: values.phone_region ?? null,
        defaultRegion: options.defaultRegion ?? null,
        source: "import",
      });
      if (!isImportPhoneWritable(preview)) {
        const severity =
          preview.code === "phone_region_required" || preview.code === "phone_identity_unresolved"
            ? "error"
            : "error";
        pushIssue(
          issues,
          row.rowNumber,
          "phone",
          preview.code ?? "invalid_phone",
          preview.code === "phone_region_required"
            ? "Provide an ISO-2 phone region or use an E.164 number (+...)."
            : "Phone number is invalid.",
          severity,
        );
      } else if (preview.phoneE164) {
        values.phone = preview.phoneE164;
      }
    }

    if (values.phone_region) {
      const region = values.phone_region.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(region)) {
        pushIssue(
          issues,
          row.rowNumber,
          "phone_region",
          "invalid_phone_region",
          "Phone region must be a 2-letter ISO country code.",
          "error",
        );
      } else {
        values.phone_region = region;
      }
    }

    if (values.date_of_birth) {
      const date = normalizeDate(values.date_of_birth);
      if (!date) {
        pushIssue(
          issues,
          row.rowNumber,
          "date_of_birth",
          "invalid_date",
          "Date of birth must be a valid date (YYYY-MM-DD).",
          "error",
        );
      } else {
        values.date_of_birth = date;
      }
    }

    if (values.source) {
      const source = values.source.trim().toLowerCase();
      if (!(CUSTOMER_ACQUISITION_SOURCES as readonly string[]).includes(source)) {
        pushIssue(
          issues,
          row.rowNumber,
          "source",
          "invalid_source",
          `Source must be one of: ${CUSTOMER_ACQUISITION_SOURCES.join(", ")}.`,
          "error",
        );
      } else {
        values.source = source;
      }
    }

    if (values.notes) {
      const field = getCustomerImportField("notes");
      if (field.maxLength && values.notes.length > field.maxLength) {
        pushIssue(issues, row.rowNumber, "notes", "notes_too_long", "Notes are too long.", "error");
      }
    }

    if (values.company_name) {
      const companyName = values.company_name.trim();
      const field = getCustomerImportField("company_name");
      if (field.maxLength && companyName.length > field.maxLength) {
        pushIssue(
          issues,
          row.rowNumber,
          "company_name",
          "company_name_too_long",
          "Company name is too long.",
          "error",
        );
      } else {
        values.company_name = companyName;
      }
    }

    if (values.gender) {
      values.gender = values.gender.trim();
    }

    return { rowNumber: row.rowNumber, values, issues };
  });
}

export function listUnmappedColumns(mappings: FieldMappingEntry[]): string[] {
  return mappings
    .filter((entry) => !entry.ignored && !entry.targetFieldId)
    .map((entry) => entry.sourceHeader);
}
