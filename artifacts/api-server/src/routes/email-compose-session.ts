/**
 * POST /email/compose-session — bind a New Email conversation to channel_sessions.
 *
 * Email agents have email.view + reply but not channels.manage. Client-side
 * inserts into channel_sessions are blocked by RLS; this route inserts with the
 * service role after verifying reply permission + company/channel ownership.
 * Does not send mail and does not touch AI Copilot.
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

const REPLY_PERMISSIONS = ["ai.conversations.reply", "conversation.reply", "channels.manage"] as const;

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

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function requireAnyReplyPermission(req: Request, companyId: string): Promise<void> {
  if (req.supabaseIsSuperAdmin) return;
  const userClient = getUserScopedClient(req);
  let lastError: unknown = null;
  for (const code of REPLY_PERMISSIONS) {
    try {
      await requireCompanyPermission(userClient, companyId, code);
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof CompanyPermissionDeniedError)) throw error;
    }
  }
  if (lastError instanceof CompanyPermissionDeniedError) {
    throw new HttpError(403, "Permission denied.", "forbidden");
  }
  throw lastError instanceof Error ? lastError : new HttpError(403, "Permission denied.", "forbidden");
}

router.post("/email/compose-session", async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    const conversationId = readString(req.body?.conversationId);
    const companyChannelId = readString(req.body?.companyChannelId);
    const fromEmail = readString(req.body?.fromEmail) || null;

    if (!conversationId || !companyChannelId) {
      throw new HttpError(400, "conversationId and companyChannelId are required", "validation_error");
    }

    await assertRouteCommercialFeature(companyId, "email_channel");
    await requireAnyReplyPermission(req, companyId);

    const client = getServiceClient();

    const { data: conversation, error: conversationError } = await client
      .from("conversations")
      .select("id, company_id, company_channel_id, channel_type, deleted_at")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation || conversation.deleted_at) {
      throw new HttpError(404, "Conversation not found.", "not_found");
    }
    if (conversation.company_id !== companyId) {
      throw new HttpError(403, "Conversation is outside company scope.", "forbidden");
    }
    if (String(conversation.channel_type ?? "").toLowerCase() !== "email") {
      throw new HttpError(400, "Conversation is not an email conversation.", "validation_error");
    }
    if (
      conversation.company_channel_id &&
      conversation.company_channel_id !== companyChannelId
    ) {
      throw new HttpError(400, "companyChannelId does not match the conversation.", "validation_error");
    }

    const { data: channel, error: channelError } = await client
      .from("company_channels")
      .select("id, company_id, deleted_at, is_enabled")
      .eq("id", companyChannelId)
      .maybeSingle();

    if (channelError) throw channelError;
    if (!channel || channel.deleted_at) {
      throw new HttpError(404, "Company email channel not found.", "not_found");
    }
    if (channel.company_id !== companyId) {
      throw new HttpError(403, "Channel is outside company scope.", "forbidden");
    }

    const { data: existing, error: existingError } = await client
      .from("channel_sessions")
      .select("id, external_thread_id, channel_key, company_channel_id")
      .eq("conversation_id", conversationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.id) {
      res.json({
        id: existing.id,
        external_thread_id: existing.external_thread_id,
        channel_key: existing.channel_key,
        company_channel_id: existing.company_channel_id,
      });
      return;
    }

    const { data: created, error: insertError } = await client
      .from("channel_sessions")
      .insert({
        company_id: companyId,
        company_channel_id: companyChannelId,
        conversation_id: conversationId,
        channel_key: "email",
        external_thread_id: conversationId,
        sender_external_id: fromEmail,
        metadata: { source: "email_workspace_compose" },
      })
      .select("id, external_thread_id, channel_key, company_channel_id")
      .single();

    if (insertError) {
      const { data: raced } = await client
        .from("channel_sessions")
        .select("id, external_thread_id, channel_key, company_channel_id")
        .eq("conversation_id", conversationId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (raced?.id) {
        res.json(raced);
        return;
      }
      throw insertError;
    }

    if (!created?.id) {
      throw new HttpError(500, "Channel session was not created.", "session_create_failed");
    }

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export default router;
