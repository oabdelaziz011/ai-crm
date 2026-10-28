import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";
import type {
  CustomerImportDuplicatePolicy,
  FieldMappingEntry,
} from "@workspace/customer-import";

export type CustomerImportJob = {
  id: string;
  companyId: string;
  status: string;
  fileName: string | null;
  fileSizeBytes: number | null;
  selectedSheetIndex: number;
  duplicatePolicy: CustomerImportDuplicatePolicy;
  defaultPhoneRegion: string | null;
  mapping: FieldMappingEntry[];
  worksheets: Array<{ name: string; index: number; rowCount: number }>;
  columns: Array<{ index: number; header: string; samples: string[] }>;
  summary: Record<string, unknown>;
  validationIssues: Array<{
    rowNumber: number;
    field: string | null;
    code: string;
    message: string;
    severity: string;
  }>;
  duplicateCandidates: Array<{
    rowNumber: number;
    matchKind: string;
    existingCustomerId?: string;
    matchedValue: string;
    policyAction: string;
  }>;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  flaggedCount: number;
  failedCount: number;
  errorMessage: string | null;
  cancelRequested: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  limits: {
    maxFileBytes: number;
    maxRows: number;
    previewRows: number;
  };
  hasStagedRows: boolean;
};

export class CustomerImportClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CustomerImportClientError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getFreshAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function apiBase(): string {
  const base = resolveAuthenticatedApiBase();
  if (!base) throw new Error("API base URL is not configured");
  return base;
}

async function parseError(res: Response): Promise<CustomerImportClientError> {
  let code = "request_failed";
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; message?: string; code?: string };
    code = body.error || body.code || code;
    message = body.message || message;
  } catch {
    // ignore
  }
  return new CustomerImportClientError(res.status, code, message);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export async function fetchCustomerImportMeta() {
  const res = await fetch(`${apiBase()}/customers/import/meta`, { headers: await authHeaders() });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<{
    fields: unknown[];
    limits: CustomerImportJob["limits"];
    connectors: Array<{ id: string; status: string; labelKey: string; descriptionKey: string }>;
  }>;
}

export async function downloadCustomerImportTemplate(locale?: string | null): Promise<Blob> {
  const params = new URLSearchParams();
  const normalized = locale?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("ar") || normalized.startsWith("en")) {
    params.set("locale", normalized.startsWith("ar") ? "ar" : "en");
  }
  const query = params.toString();
  const res = await fetch(
    `${apiBase()}/customers/import/template${query ? `?${query}` : ""}`,
    {
      headers: await authHeaders(),
    },
  );
  if (!res.ok) throw await parseError(res);
  return res.blob();
}

export async function createCustomerImportJob(input: {
  file: File;
  sheetIndex?: number;
  duplicatePolicy?: CustomerImportDuplicatePolicy;
  defaultPhoneRegion?: string | null;
}): Promise<CustomerImportJob> {
  const res = await fetch(`${apiBase()}/customers/import/jobs`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      fileName: input.file.name,
      fileBase64: await fileToBase64(input.file),
      sheetIndex: input.sheetIndex,
      duplicatePolicy: input.duplicatePolicy ?? "skip",
      defaultPhoneRegion: input.defaultPhoneRegion ?? null,
    }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { job: CustomerImportJob };
  return body.job;
}

export async function getCustomerImportJob(jobId: string): Promise<CustomerImportJob> {
  const res = await fetch(`${apiBase()}/customers/import/jobs/${jobId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { job: CustomerImportJob };
  return body.job;
}

export async function saveCustomerImportMapping(input: {
  jobId: string;
  mapping: FieldMappingEntry[];
  duplicatePolicy?: CustomerImportDuplicatePolicy;
  defaultPhoneRegion?: string | null;
}): Promise<CustomerImportJob> {
  const res = await fetch(`${apiBase()}/customers/import/jobs/${input.jobId}/mapping`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      mapping: input.mapping,
      duplicatePolicy: input.duplicatePolicy,
      defaultPhoneRegion: input.defaultPhoneRegion,
    }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { job: CustomerImportJob };
  return body.job;
}

export async function validateCustomerImportJob(jobId: string): Promise<CustomerImportJob> {
  const res = await fetch(`${apiBase()}/customers/import/jobs/${jobId}/validate`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { job: CustomerImportJob };
  return body.job;
}

export async function confirmCustomerImportJob(jobId: string): Promise<CustomerImportJob> {
  const res = await fetch(`${apiBase()}/customers/import/jobs/${jobId}/confirm`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ confirmed: true }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { job: CustomerImportJob };
  return body.job;
}

export async function cancelCustomerImportJob(jobId: string): Promise<CustomerImportJob> {
  const res = await fetch(`${apiBase()}/customers/import/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { job: CustomerImportJob };
  return body.job;
}

export async function downloadCustomerImportErrorReport(jobId: string): Promise<Blob> {
  const res = await fetch(`${apiBase()}/customers/import/jobs/${jobId}/error-report`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.blob();
}
