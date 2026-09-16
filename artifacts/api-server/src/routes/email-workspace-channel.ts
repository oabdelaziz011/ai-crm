/**
 * POST /email/workspace-channel — resolve the company's Email channel for Email Workspace.
 *
 * Email agents have email.view but not channels.view. Client SELECT on
 * company_channels is blocked by RLS; this route reads with the service role
 * after verifying email.view + email_channel entitlement.
 * Returns public Email channel metadata only — never credentials or secrets.
 */
import { Router, type IRouter, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

const EMAIL_CHANNEL_PROVIDERS = new Set(["email", "generic.email", "smtp"]);

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

function resolveEffectiveCompanyId(req: Request): string {
  const companyId = String(req.body?.companyId ?? "");
  const effectiveCompanyId =
    req.supabaseIsSuperAdmin && companyId
      ? companyId
      : (req.supabaseCompanyId ?? companyId);
  if (!effectiveCompanyId) {
    throw new HttpError(400, "companyId required", "validation_error");
  }
  return effectiveCompanyId;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

type CompanyChannelRow = {
  id: string;
  company_id: string;
  display_name: string | null;
  is_enabled: boolean | null;
  provider: string | null;
  configuration: Record<string, unknown> | null;
  communication_channel?: { key?: string | null } | { key?: string | null }[] | null;
};

function communicationChannelKey(row: CompanyChannelRow): string {
  const embedded = row.communication_channel;
  if (Array.isArray(embedded)) return readKey(embedded[0]?.key);
  return readKey(embedded?.key);
}

function isCompanyEmailChannelRow(companyId: string, row: CompanyChannelRow): boolean {
  if (row.company_id !== companyId) return false;
  if (communicationChannelKey(row) === "email") return true;
  if (readKey(row.configuration?.channelKey) === "email") return true;
  if (EMAIL_CHANNEL_PROVIDERS.has(readKey(row.provider))) return true;
  if (readTrimmedString(row.configuration?.fromEmail)) return true;
  if (readKey(row.configuration?.credentialsSource) === "company_email_settings") return true;
  return readKey(row.configuration?.outboundProvider) === "smtp";
}

function pickCompanyEmailChannel(companyId: string, rows: CompanyChannelRow[]): CompanyChannelRow | null {
  const matches = rows.filter((row) => isCompanyEmailChannelRow(companyId, row));
  return matches.find((row) => row.is_enabled !== false) ?? matches[0] ?? null;
}

function toPublicEmailWorkspaceChannel(row: CompanyChannelRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    displayName: readTrimmedString(row.display_name),
    isEnabled: row.is_enabled !== false,
    fromEmail: readTrimmedString(row.configuration?.fromEmail),
    fromName: readTrimmedString(row.configuration?.fromName),
  };
}

router.post("/email/workspace-channel", async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    await assertRouteCommercialFeature(companyId, "email_channel");
    if (!req.supabaseIsSuperAdmin) {
      const userClient = getUserScopedClient(req);
      try {
        await requireCompanyPermission(userClient, companyId, "email.view");
      } catch (error) {
        if (error instanceof CompanyPermissionDeniedError) {
          throw new HttpError(403, "Permission denied.", "forbidden");
        }
        throw error;
      }
    }

    const client = getServiceClient();
    const { data, error } = await client
      .from("company_channels")
      .select(
        "id, company_id, display_name, is_enabled, provider, configuration, communication_channel:communication_channels(key)",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw error;

    const picked = pickCompanyEmailChannel(companyId, (data ?? []) as CompanyChannelRow[]);
    res.json({
      channel: picked ? toPublicEmailWorkspaceChannel(picked) : null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
