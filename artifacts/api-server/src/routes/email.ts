import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import i18next from "i18next";
import en from "@login-app/locales/en/common.json" with { type: "json" };
import { SmtpEmailTransport } from "@login-app/lib/notifications/providers/email/adapter/smtp-email-transport";
import { EmailRenderer } from "@login-app/lib/notifications/providers/email/renderer/email-renderer";
import { createEmailProvider } from "@login-app/lib/notifications/providers/email/services/email-provider";
import { createEmailsSentCommercialPort } from "../platform/emails-sent-commercial-adapter.js";
import {
  SendEmailTemplateError,
  sendEmailTemplate,
} from "@login-app/lib/email-templates/send-email-template";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { resolveAgentDispatchContext } from "../platform/resolve-agent-dispatch-context.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/** Minimal cooldown for template test-send (per company + actor). */
const TEST_SEND_COOLDOWN_MS = 30_000;
const testSendCooldown = new Map<string, number>();

void i18next.init({
  lng: "en",
  resources: { en: { common: en } },
});

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials missing");
  }
  return createClient(url, key);
}

function createProvider(client: ReturnType<typeof createClient> | import("@supabase/supabase-js").SupabaseClient) {
  const t = i18next.getFixedT("en", "common");
  const renderer = EmailRenderer.fromI18n(t);
  // EmailProvider is typed against login-app's SupabaseClient generics; cast at the boundary.
  return createEmailProvider(client as never, new SmtpEmailTransport(), renderer, {
    emailsSentCommercial: createEmailsSentCommercialPort(client),
  });
}

router.post("/email/health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.healthCheck(companyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/email/test-connection", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const recipientEmail = String(req.body?.recipientEmail ?? "");
    if (!recipientEmail) {
      res.status(400).json({ error: "recipientEmail required" });
      return;
    }
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.testConnection(companyId, recipientEmail);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/email/process-queue", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.processPending(companyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/email/templates/test-send", async (req, res, next) => {
  try {
    const companyId = String(req.supabaseCompanyId ?? req.body?.companyId ?? "");
    const templateId = String(req.body?.templateId ?? "");
    const recipientEmail = String(req.body?.recipientEmail ?? "");

    if (!companyId) {
      throw new HttpError(403, "No company context.", "forbidden");
    }
    if (!templateId) {
      throw new HttpError(400, "templateId is required.", "validation_error");
    }

    const client = getServiceClient();
    const ctx = await resolveAgentDispatchContext(client, req, companyId);
    if (!ctx.isSuperAdmin && !ctx.hasPermission("settings.edit")) {
      throw new HttpError(403, "settings.edit permission is required.", "forbidden");
    }

    const actorKey = `${companyId}:${ctx.userId ?? "unknown"}`;
    const last = testSendCooldown.get(actorKey) ?? 0;
    const now = Date.now();
    if (now - last < TEST_SEND_COOLDOWN_MS) {
      throw new HttpError(
        429,
        "Please wait before sending another test email.",
        "rate_limit_exceeded",
      );
    }

    const provider = createProvider(client);

    const result = await sendEmailTemplate(
      { companyId, templateId, recipientEmail },
      {
        loadTemplate: async (scopedCompanyId, id) => {
          const { data, error } = await client
            .from("company_email_templates")
            .select("id, company_id, name, code, subject, body, enabled")
            .eq("id", id)
            .eq("company_id", scopedCompanyId)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) return null;
          return {
            id: String(data.id),
            companyId: String(data.company_id),
            name: String(data.name),
            code: String(data.code),
            subject: String(data.subject ?? ""),
            body: String(data.body ?? ""),
            enabled: data.enabled !== false,
          };
        },
        sendRendered: async (args) => {
          await provider.sendDirect(args.companyId, {
            to: args.to,
            subject: args.subject,
            text: args.text,
            html: args.html,
            queueId: `template-test:${args.templateId}`,
          });
          return { ok: true as const };
        },
      },
    );

    testSendCooldown.set(actorKey, now);

    logger.info(
      {
        event: "email_template_test_sent",
        companyId,
        actorId: ctx.userId,
        templateId: result.templateId,
        templateCode: result.templateCode,
        recipientEmail: result.recipientEmail,
      },
      "Email template test sent",
    );

    res.json({
      ok: true,
      templateId: result.templateId,
      templateCode: result.templateCode,
      recipientEmail: result.recipientEmail,
      subject: result.subject,
      unresolved: result.unresolved,
    });
  } catch (error) {
    if (error instanceof SendEmailTemplateError) {
      const status =
        error.code === "not_found"
          ? 404
          : error.code === "forbidden"
            ? 403
            : error.code === "provider_error"
              ? 502
              : 400;
      res.status(status).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
});

export default router;
