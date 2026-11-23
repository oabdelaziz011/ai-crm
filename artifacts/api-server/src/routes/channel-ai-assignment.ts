import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { assertCompanyAccess } from "../middleware/assert-company-access.js";
import { HttpError } from "../middleware/error-handler.js";

const router: IRouter = Router();

router.use(confineToPathPrefixes("/channels/ai-assignment"));
router.use(requireSupabaseAuth);

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "supabase_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ALLOWED_CHANNEL_KEYS = new Set(["messenger", "instagram"]);

async function assertMessengerOrInstagramChannel(input: {
  companyId: string;
  companyChannelId: string;
}): Promise<void> {
  const client = getServiceClient();
  const { data: channel, error } = await client
    .from("company_channels")
    .select("id,company_id,channel_id")
    .eq("id", input.companyChannelId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new HttpError(500, error.message, "CHANNEL_LOOKUP_FAILED");
  }
  if (!channel) {
    throw new HttpError(404, "Company channel not found", "CHANNEL_NOT_FOUND");
  }
  const { data: comm, error: commError } = await client
    .from("communication_channels")
    .select("key")
    .eq("id", channel.channel_id)
    .maybeSingle();
  if (commError) {
    throw new HttpError(500, commError.message, "CHANNEL_LOOKUP_FAILED");
  }
  const key = String(comm?.key ?? "").trim();
  if (!ALLOWED_CHANNEL_KEYS.has(key)) {
    throw new HttpError(
      400,
      "AI assignment is only supported for Messenger and Instagram channels.",
      "CHANNEL_AI_ASSIGN_UNSUPPORTED",
    );
  }
}

router.get("/channels/ai-assignment", async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? "").trim();
    const companyChannelId = String(req.query.companyChannelId ?? "").trim();
    if (!companyId || !companyChannelId) {
      throw new HttpError(400, "companyId and companyChannelId are required");
    }
    assertCompanyAccess(req, companyId);
    await assertMessengerOrInstagramChannel({ companyId, companyChannelId });

    const client = getServiceClient();
    const { data, error } = await client.rpc("get_company_channel_ai_assignment", {
      p_company_id: companyId,
      p_company_channel_id: companyChannelId,
    });
    if (error) throw new HttpError(500, error.message, "CHANNEL_AI_ASSIGN_GET_FAILED");
    res.json({
      companyId,
      companyChannelId,
      assignedAiEmployeeId:
        (data as { assignedAiEmployeeId?: string | null } | null)?.assignedAiEmployeeId ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/channels/ai-assignment",
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "").trim();
      const companyChannelId = String(req.body?.companyChannelId ?? "").trim();
      const assignedRaw = req.body?.assignedAiEmployeeId;
      const assignedAiEmployeeId =
        assignedRaw === null || assignedRaw === undefined || assignedRaw === ""
          ? null
          : String(assignedRaw).trim();
      if (!companyId || !companyChannelId) {
        throw new HttpError(400, "companyId and companyChannelId are required");
      }
      await assertMessengerOrInstagramChannel({ companyId, companyChannelId });

      if (assignedAiEmployeeId) {
        const client = getServiceClient();
        const { data: employee, error: empError } = await client
          .from("ai_employees")
          .select("id,company_id")
          .eq("id", assignedAiEmployeeId)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .maybeSingle();
        if (empError) throw new HttpError(500, empError.message, "CHANNEL_AI_ASSIGN_EMPLOYEE_LOOKUP");
        if (!employee) {
          throw new HttpError(400, "AI Employee not found for this company", "CHANNEL_AI_ASSIGN_EMPLOYEE_MISSING");
        }
      }

      const client = getServiceClient();
      const { data, error } = await client.rpc("set_company_channel_ai_assignment", {
        p_company_id: companyId,
        p_company_channel_id: companyChannelId,
        p_assigned_ai_employee_id: assignedAiEmployeeId,
      });
      if (error) throw new HttpError(500, error.message, "CHANNEL_AI_ASSIGN_SET_FAILED");
      res.json({
        companyId,
        companyChannelId,
        assignedAiEmployeeId:
          (data as { assignedAiEmployeeId?: string | null } | null)?.assignedAiEmployeeId ?? null,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
