import type { Company } from "@/lib/types";

export type RejectCompanyErrorCode =
  | "reasonRequired"
  | "cannotRejectApproved"
  | "forbidden"
  | "companyNotFound"
  | "invalidResponse"
  | "unknown";

const ERROR_CODE_BY_TOKEN: Readonly<Record<string, RejectCompanyErrorCode>> = {
  rejection_reason_required: "reasonRequired",
  cannot_reject_approved_company: "cannotRejectApproved",
  "insufficient permissions to reject company": "forbidden",
  company_not_found: "companyNotFound",
  company_id_required: "companyNotFound",
};

export function classifyRejectCompanyError(message: string): RejectCompanyErrorCode {
  const normalized = message.trim().toLowerCase();
  for (const [token, code] of Object.entries(ERROR_CODE_BY_TOKEN)) {
    if (normalized.includes(token)) return code;
  }
  return "unknown";
}

export function rejectCompanyErrorI18nKey(code: RejectCompanyErrorCode): string {
  return `companies.approval.errors.${code}`;
}

export function parseRejectCompanyResponse(data: unknown): Company {
  if (!data || typeof data !== "object") {
    throw new Error("invalidResponse");
  }

  const record = data as Record<string, unknown>;
  const company = record.company;
  if (!company || typeof company !== "object") {
    throw new Error("invalidResponse");
  }

  const parsed = company as Record<string, unknown>;
  if (typeof parsed.id !== "string" || !parsed.id) {
    throw new Error("invalidResponse");
  }

  if (parsed.approval_status !== "rejected") {
    throw new Error("invalidResponse");
  }

  return company as Company;
}
