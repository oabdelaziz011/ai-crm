import { Router, type IRouter } from "express";

import type { ChannelAttachmentDto } from "@workspace/channel-platform";

import { requiresServerOutboundDispatch } from "@workspace/channel-platform";

import { providerOpsRateLimiter } from "../middleware/rate-limit.js";

import { HttpError } from "../middleware/error-handler.js";

import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";

import { resolveAgentDispatchContext } from "../platform/resolve-agent-dispatch-context.js";

import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

import { dispatchOmnichannelOutboundMessage } from "../services/omnichannel-outbound-dispatch.js";

import {

  beginOutbound400Audit,

  enterOutboundValidation,

  isOutboundDispatchPath,

  passOutboundValidation,

  recordOutbound400FromHttpError,

} from "../debug/omni-outbound-dispatch-audit.js";



const router: IRouter = Router();



router.use(providerOpsRateLimiter);

router.use((req, _res, next) => {
  if (isOutboundDispatchPath(req)) {
    beginOutbound400Audit(req);
  }
  next();
});

router.use(requireSupabaseAuth);

router.use(requireCompanyScope("companyId"));



type OmnichannelOutboundDispatchBody = {

  companyId?: string;

  conversationId?: string;

  companyChannelId?: string;

  channelKey?: string;

  channelSessionId?: string;

  externalThreadId?: string;

  text?: string;

  attachments?: ChannelAttachmentDto[];

  outboundMessageId?: string;

  metadata?: Record<string, unknown>;

  persistConversationMessage?: boolean;

};



function throwRouteValidation400(

  validationName: string,

  line: number,

  message: string,

  code = "validation_error",

): never {

  recordOutbound400FromHttpError({

    statusCode: 400,

    validationName,

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line,

    code,

    message,

    rootCause: message,

  });

  throw new HttpError(400, message, code);

}



function readDispatchBody(body: OmnichannelOutboundDispatchBody) {

  enterOutboundValidation({

    validationName: "readDispatchBody",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 58,

    requestPayload: body,

  });



  const companyId = String(body.companyId ?? "").trim();

  enterOutboundValidation({

    validationName: "companyId.required",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 66,

    requestPayload: { companyId: body.companyId },

  });

  if (!companyId) throwRouteValidation400("companyId.required", 66, "companyId is required.");

  passOutboundValidation("companyId.required", { companyId });



  const conversationId = String(body.conversationId ?? "").trim();

  enterOutboundValidation({

    validationName: "conversationId.required",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 76,

    requestPayload: { conversationId: body.conversationId },

  });

  if (!conversationId) throwRouteValidation400("conversationId.required", 76, "conversationId is required.");

  passOutboundValidation("conversationId.required", { conversationId });



  const companyChannelId = String(body.companyChannelId ?? "").trim();

  enterOutboundValidation({

    validationName: "companyChannelId.required",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 86,

    requestPayload: { companyChannelId: body.companyChannelId },

  });

  if (!companyChannelId) throwRouteValidation400("companyChannelId.required", 86, "companyChannelId is required.");

  passOutboundValidation("companyChannelId.required", { companyChannelId });



  const channelKey = String(body.channelKey ?? "").trim();

  enterOutboundValidation({

    validationName: "channelKey.required",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 96,

    requestPayload: { channelKey: body.channelKey },

  });

  if (!channelKey) throwRouteValidation400("channelKey.required", 96, "channelKey is required.");

  passOutboundValidation("channelKey.required", { channelKey });



  const externalThreadId = String(body.externalThreadId ?? "").trim();

  enterOutboundValidation({

    validationName: "externalThreadId.required",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 106,

    requestPayload: { externalThreadId: body.externalThreadId },

  });

  if (!externalThreadId) throwRouteValidation400("externalThreadId.required", 106, "externalThreadId is required.");

  passOutboundValidation("externalThreadId.required", { externalThreadId });



  const text = String(body.text ?? "");

  const attachments = Array.isArray(body.attachments) ? body.attachments : undefined;

  const hasText = text.trim().length > 0;

  const hasAttachments = (attachments?.length ?? 0) > 0;

  enterOutboundValidation({

    validationName: "textOrAttachments.required",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 118,

    requestPayload: { hasText, attachmentCount: attachments?.length ?? 0 },

  });

  if (!hasText && !hasAttachments) {

    throwRouteValidation400(

      "textOrAttachments.required",

      118,

      "Outbound message text or attachments are required.",

    );

  }

  passOutboundValidation("textOrAttachments.required", { hasText, hasAttachments });



  enterOutboundValidation({

    validationName: "requiresServerOutboundDispatch",

    layer: "route.readDispatchBody",

    file: "omnichannel.ts",

    function: "readDispatchBody",

    line: 128,

    requestPayload: { channelKey },

  });

  if (!requiresServerOutboundDispatch(channelKey)) {

    recordOutbound400FromHttpError({

      statusCode: 400,

      validationName: "requiresServerOutboundDispatch",

      layer: "route.readDispatchBody",

      file: "omnichannel.ts",

      function: "readDispatchBody",

      line: 128,

      code: "browser_dispatch_required",

      message: `Channel "${channelKey}" must be dispatched from the browser channel platform.`,

      rootCause: `Channel "${channelKey}" is not configured for server-side dispatch`,

    });

    throw new HttpError(

      400,

      `Channel "${channelKey}" must be dispatched from the browser channel platform.`,

      "browser_dispatch_required",

    );

  }

  passOutboundValidation("requiresServerOutboundDispatch", { channelKey });



  passOutboundValidation("readDispatchBody");



  return {

    companyId,

    conversationId,

    companyChannelId,

    channelKey,

    channelSessionId: body.channelSessionId?.trim() || undefined,

    externalThreadId,

    text,

    attachments,

    outboundMessageId: body.outboundMessageId?.trim() || undefined,

    metadata:

      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)

        ? body.metadata

        : undefined,

    persistConversationMessage: body.persistConversationMessage,

  };

}



router.post("/omnichannel/outbound/dispatch", async (req, res, next) => {

  try {

    enterOutboundValidation({

      validationName: "routeHandler.enter",

      layer: "route.handler",

      file: "omnichannel.ts",

      function: "POST /omnichannel/outbound/dispatch",

      line: 198,

      requestPayload: req.body ?? null,

    });



    const input = readDispatchBody(req.body as OmnichannelOutboundDispatchBody);

    passOutboundValidation("routeHandler.readDispatchBody");



    enterOutboundValidation({

      validationName: "resolveAgentDispatchContext",

      layer: "route.handler",

      file: "omnichannel.ts",

      function: "resolveAgentDispatchContext",

      line: 207,

      requestPayload: { companyId: input.companyId },

    });

    const platform = getWebhookPlatform();

    const ctx = await resolveAgentDispatchContext(platform.client, req, input.companyId);

    passOutboundValidation("resolveAgentDispatchContext");



    enterOutboundValidation({

      validationName: "dispatchOmnichannelOutboundMessage",

      layer: "route.handler",

      file: "omnichannel.ts",

      function: "dispatchOmnichannelOutboundMessage",

      line: 216,

      requestPayload: input,

    });

    const result = await dispatchOmnichannelOutboundMessage(ctx, input);

    passOutboundValidation("dispatchOmnichannelOutboundMessage");

    passOutboundValidation("routeHandler.enter", { deliveryStatus: result.deliveryStatus });



    res.json(result);

  } catch (error) {

    next(error);

  }

});



export default router;

