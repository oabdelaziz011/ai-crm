/**
 * CRM customer import API — CSV/XLSX template, upload, map, validate, confirm, progress, error report.
 */
import { Router, type IRouter, type Request, json as expressJson } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  CUSTOMER_IMPORT_CONNECTORS,
  CUSTOMER_IMPORT_LIMITS,
  resolveCustomerImportLocale,
} from "@workspace/customer-import";
import { requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";
import { CustomerImportService } from "../services/customer-import/customer-import-service.js";

const router: IRouter = Router();
// Base64 file payloads need headroom above the global 1mb JSON limit.
router.use(expressJson({ limit: "8mb" }));
router.use(requireSupabaseAuth);

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "auth_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getUserScopedClient(req: Request) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!url || !anon || !token) {
    throw new HttpError(401, "Authentication required.", "unauthorized");
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function requireCompany(req: Request): { companyId: string; userId: string } {
  const companyId = req.supabaseCompanyId;
  const userId = req.supabaseUser?.id;
  if (!companyId || !userId) {
    throw new HttpError(401, "Authenticated company context required", "unauthorized");
  }
  return { companyId, userId };
}

async function requireImportPermission(req: Request, companyId: string) {
  const client = getUserScopedClient(req);
  try {
    await requireCompanyPermission(client, companyId, "customers.import");
  } catch (error) {
    if (!(error instanceof CompanyPermissionDeniedError)) throw error;
    try {
      await requireCompanyPermission(client, companyId, "customers.create");
    } catch (inner) {
      if (inner instanceof CompanyPermissionDeniedError) {
        throw new HttpError(403, "Permission denied.", "forbidden");
      }
      throw inner;
    }
  }
}

function mapServiceError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("JOB_NOT_FOUND")) throw new HttpError(404, message, "not_found");
  if (message.startsWith("FORBIDDEN") || message.startsWith("FORBIDDEN_UPDATE")) {
    throw new HttpError(403, message, "forbidden");
  }
  if (
    message.startsWith("INVALID_") ||
    message.startsWith("EMPTY_") ||
    message.startsWith("FILE_") ||
    message.startsWith("TOO_") ||
    message.startsWith("UNSUPPORTED_") ||
    message.startsWith("MALFORMED_") ||
    message.startsWith("CONFIRMATION_") ||
    message.startsWith("name_required") ||
    message.startsWith("duplicate_target") ||
    message.startsWith("SHEET_")
  ) {
    throw new HttpError(400, message, "validation_error");
  }
  throw new HttpError(500, "Customer import failed.", "import_failed");
}

router.get("/customers/import/meta", async (req, res, next) => {
  try {
    const { companyId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const service = new CustomerImportService(getServiceClient());
    res.json({
      fields: service.listFields(),
      limits: CUSTOMER_IMPORT_LIMITS,
      connectors: CUSTOMER_IMPORT_CONNECTORS,
    });
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

function resolveTemplateLocale(req: Request): string {
  const fromQuery = typeof req.query.locale === "string" ? req.query.locale : null;
  if (fromQuery?.trim()) return resolveCustomerImportLocale(fromQuery);
  const accept = req.header("accept-language");
  if (accept) {
    const primary = accept.split(",")[0]?.trim();
    return resolveCustomerImportLocale(primary);
  }
  return "en";
}

router.get("/customers/import/template", async (req, res, next) => {
  try {
    const { companyId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const locale = resolveTemplateLocale(req);
    const service = new CustomerImportService(getServiceClient());
    const template = await service.buildTemplate(locale);
    res.setHeader("Content-Type", template.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${template.fileName}"`);
    res.send(template.buffer);
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

router.post("/customers/import/jobs", async (req, res, next) => {
  try {
    const { companyId, userId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const body = req.body ?? {};
    if (typeof body.fileBase64 !== "string" || typeof body.fileName !== "string") {
      throw new HttpError(400, "fileName and fileBase64 are required.", "validation_error");
    }
    const service = new CustomerImportService(getServiceClient());
    const job = await service.createJob({
      companyId,
      userId,
      fileName: body.fileName,
      fileBase64: body.fileBase64,
      sheetIndex: typeof body.sheetIndex === "number" ? body.sheetIndex : undefined,
      duplicatePolicy: body.duplicatePolicy,
      defaultPhoneRegion: body.defaultPhoneRegion ?? null,
    });
    res.status(201).json({ job });
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

router.get("/customers/import/jobs/:jobId", async (req, res, next) => {
  try {
    const { companyId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const service = new CustomerImportService(getServiceClient());
    const job = await service.getJob(companyId, String(req.params.jobId));
    res.json({ job });
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

// POST (not PUT): matches other import mutations and avoids CORS preflight gaps on strict allowlists.
router.post("/customers/import/jobs/:jobId/mapping", async (req, res, next) => {
  try {
    const { companyId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const body = req.body ?? {};
    if (!Array.isArray(body.mapping)) {
      throw new HttpError(400, "mapping array is required.", "validation_error");
    }
    const service = new CustomerImportService(getServiceClient());
    const job = await service.updateMapping({
      companyId,
      jobId: String(req.params.jobId),
      mapping: body.mapping,
      duplicatePolicy: body.duplicatePolicy,
      defaultPhoneRegion: body.defaultPhoneRegion,
      sheetIndex: body.sheetIndex,
      fileBase64: body.fileBase64,
      fileName: body.fileName,
    });
    res.json({ job });
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

router.post("/customers/import/jobs/:jobId/validate", async (req, res, next) => {
  try {
    const { companyId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const service = new CustomerImportService(getServiceClient());
    const job = await service.validateJob({ companyId, jobId: String(req.params.jobId) });
    res.json({ job });
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

router.post("/customers/import/jobs/:jobId/confirm", async (req, res, next) => {
  try {
    const { companyId, userId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    let canUpdate = false;
    try {
      await requireCompanyPermission(getUserScopedClient(req), companyId, "customers.edit");
      canUpdate = true;
    } catch (error) {
      if (!(error instanceof CompanyPermissionDeniedError)) throw error;
    }
    const service = new CustomerImportService(getServiceClient());
    const job = await service.confirmAndRun({
      companyId,
      userId,
      jobId: String(req.params.jobId),
      confirmed: Boolean(req.body?.confirmed),
      canUpdate,
    });
    res.json({ job });
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

router.post("/customers/import/jobs/:jobId/cancel", async (req, res, next) => {
  try {
    const { companyId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const service = new CustomerImportService(getServiceClient());
    const job = await service.cancelJob(companyId, String(req.params.jobId));
    res.json({ job });
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

router.get("/customers/import/jobs/:jobId/error-report", async (req, res, next) => {
  try {
    const { companyId } = requireCompany(req);
    await requireImportPermission(req, companyId);
    const service = new CustomerImportService(getServiceClient());
    const csv = await service.getErrorReport(companyId, String(req.params.jobId));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="customer-import-errors-${String(req.params.jobId).slice(0, 8)}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    next(error instanceof HttpError ? error : mapServiceError(error));
  }
});

export default router;
