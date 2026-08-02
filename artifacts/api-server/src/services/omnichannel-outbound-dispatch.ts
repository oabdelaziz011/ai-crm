import type { SupabaseClient } from "@supabase/supabase-js";

import type {

  ChannelAttachmentDto,

  OutboundDispatchRequestDto,

  OutboundDispatchResponseDto,

  ServiceContext,

} from "@workspace/channel-platform";

import {

  CompanyChannelNotFoundError,

  PermissionDeniedError,

  ValidationError,

  validateOutboundRoute,

  type ChannelSessionRow,

  type OutboundRouteTarget,

} from "@workspace/channel-platform";

import { HttpError } from "../middleware/error-handler.js";

import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

import {

  enterOutboundValidation,

  passOutboundValidation,

  recordOutbound400FromHttpError,

} from "../debug/omni-outbound-dispatch-audit.js";



export type OmnichannelOutboundDispatchInput = {

  companyId: string;

  conversationId: string;

  companyChannelId: string;

  channelKey: string;

  channelSessionId?: string;

  externalThreadId: string;

  text: string;

  attachments?: ChannelAttachmentDto[];

  outboundMessageId?: string;

  metadata?: Record<string, unknown>;

  persistConversationMessage?: boolean;

};



export type OmnichannelOutboundDispatchResult = OutboundDispatchResponseDto;



async function resolveChannelSession(

  client: SupabaseClient,

  conversationId: string,

): Promise<ChannelSessionRow | null> {

  const { data, error } = await client

    .from("channel_sessions")

    .select("id, external_thread_id, channel_key, company_channel_id")

    .eq("conversation_id", conversationId)

    .order("updated_at", { ascending: false })

    .limit(1)

    .maybeSingle();



  if (error) throw error;

  return data;

}



async function assertConversationBelongsToCompany(

  client: SupabaseClient,

  conversationId: string,

  companyId: string,

): Promise<void> {

  enterOutboundValidation({

    validationName: "assertConversationBelongsToCompany",

    layer: "service.conversationOwnership",

    file: "omnichannel-outbound-dispatch.ts",

    function: "assertConversationBelongsToCompany",

    line: 62,

    requestPayload: { conversationId, companyId },

  });



  const { data, error } = await client

    .from("conversations")

    .select("id, company_id")

    .eq("id", conversationId)

    .maybeSingle();



  if (error) throw error;

  if (!data || data.company_id !== companyId) {

    passOutboundValidation("assertConversationBelongsToCompany", { found: false });

    throw new HttpError(404, "Conversation not found for this company.", "conversation_not_found");

  }

  passOutboundValidation("assertConversationBelongsToCompany", { found: true });

}



function mapChannelPlatformError(error: unknown): never {

  if (error instanceof ValidationError) {
    const metaFailure = globalThis.__META_GRAPH_OUTBOUND_AUDIT__?.metaGraphFailure as
      | { httpResponseBody?: unknown; metaError?: Record<string, unknown> | null }
      | null
      | undefined;

    recordOutbound400FromHttpError({
      statusCode: 400,
      validationName: "channelPlatform.ValidationError",
      layer: "service.dispatcher",
      file: "omnichannel-outbound-dispatch.ts",
      function: "mapChannelPlatformError",
      line: 88,
      code: "validation_error",
      message: error.message,
      rootCause: metaFailure?.metaError
        ? `Meta Graph error code ${String(metaFailure.metaError.code ?? "unknown")}: ${String(metaFailure.metaError.message ?? error.message)}`
        : error.message,
    });

    if (metaFailure?.httpResponseBody) {
      console.info("[OMNI_OUTBOUND_400]", "metaGraph.rawProviderResponse", metaFailure.httpResponseBody);
    }

    throw new HttpError(400, error.message, "validation_error");
  }

  if (error instanceof PermissionDeniedError) {

    throw new HttpError(403, error.message, "forbidden");

  }

  if (error instanceof CompanyChannelNotFoundError) {

    throw new HttpError(404, error.message, "channel_not_found");

  }

  throw error;

}



export async function dispatchOmnichannelOutboundMessage(

  ctx: ServiceContext,

  input: OmnichannelOutboundDispatchInput,

): Promise<OmnichannelOutboundDispatchResult> {

  enterOutboundValidation({

    validationName: "dispatchOmnichannelOutboundMessage.enter",

    layer: "service.dispatch",

    file: "omnichannel-outbound-dispatch.ts",

    function: "dispatchOmnichannelOutboundMessage",

    line: 109,

    requestPayload: input,

  });

  if (typeof globalThis !== "undefined") {
    globalThis.__META_GRAPH_OUTBOUND_AUDIT__ ??= {
      path: "/api/omnichannel/outbound/dispatch",
      startedAt: new Date().toISOString(),
      stages: [],
      metaGraphFailure: null,
    };
    globalThis.__META_GRAPH_OUTBOUND_AUDIT__.stages.push({
      stage: "dispatchOmnichannelOutboundMessage.enter",
      layer: "service.dispatch",
      file: "omnichannel-outbound-dispatch.ts",
      function: "dispatchOmnichannelOutboundMessage",
      line: 109,
      enteredAt: new Date().toISOString(),
      extra: {
        companyId: input.companyId,
        companyChannelId: input.companyChannelId,
        conversationId: input.conversationId,
        channelKey: input.channelKey,
      },
    });
  }



  const platform = getWebhookPlatform();

  const client = platform.client;



  await assertConversationBelongsToCompany(client, input.conversationId, input.companyId);



  enterOutboundValidation({

    validationName: "resolveChannelSession",

    layer: "service.channelSession",

    file: "omnichannel-outbound-dispatch.ts",

    function: "resolveChannelSession",

    line: 122,

    requestPayload: { conversationId: input.conversationId },

  });

  const session = await resolveChannelSession(client, input.conversationId);

  passOutboundValidation("resolveChannelSession", { sessionId: session?.id ?? null });



  const target: OutboundRouteTarget = {

    conversationId: input.conversationId,

    companyChannelId: input.companyChannelId,

    channelKey: input.channelKey,

    externalThreadId: input.externalThreadId,

  };



  enterOutboundValidation({

    validationName: "validateOutboundRoute",

    layer: "service.routeValidation",

    file: "omnichannel-outbound-dispatch.ts",

    function: "validateOutboundRoute",

    line: 138,

    requestPayload: { session, target },

  });

  const routeCheck = validateOutboundRoute(session, target);

  if (!routeCheck.ok) {

    recordOutbound400FromHttpError({

      statusCode: 400,

      validationName: `validateOutboundRoute.${routeCheck.issue.code}`,

      layer: "service.routeValidation",

      file: "omnichannel-outbound-dispatch.ts",

      function: "validateOutboundRoute",

      line: 141,

      code: routeCheck.issue.code,

      message: routeCheck.issue.message,

      rootCause: routeCheck.issue.message,

    });

    throw new HttpError(400, routeCheck.issue.message, routeCheck.issue.code);

  }

  passOutboundValidation("validateOutboundRoute", { routeId: routeCheck.route.id });



  const route = routeCheck.route;

  enterOutboundValidation({

    validationName: "channelSessionId.matchesRoute",

    layer: "service.routeValidation",

    file: "omnichannel-outbound-dispatch.ts",

    function: "dispatchOmnichannelOutboundMessage",

    line: 155,

    requestPayload: { channelSessionId: input.channelSessionId ?? null, routeId: route.id },

  });

  if (input.channelSessionId && input.channelSessionId !== route.id) {

    recordOutbound400FromHttpError({

      statusCode: 400,

      validationName: "channelSessionId.matchesRoute",

      layer: "service.routeValidation",

      file: "omnichannel-outbound-dispatch.ts",

      function: "dispatchOmnichannelOutboundMessage",

      line: 158,

      code: "invalid_session",

      message: "Channel session does not match the conversation route.",

      rootCause: "Provided channelSessionId does not match resolved route session id",

    });

    throw new HttpError(400, "Channel session does not match the conversation route.", "invalid_session");

  }

  passOutboundValidation("channelSessionId.matchesRoute");



  const request: OutboundDispatchRequestDto = {

    companyId: input.companyId,

    companyChannelId: route.company_channel_id,

    channelKey: route.channel_key,

    conversationId: input.conversationId,

    channelSessionId: route.id,

    externalThreadId: route.external_thread_id,

    text: input.text,

    attachments: input.attachments,

    outboundMessageId: input.outboundMessageId,

    metadata: input.metadata,

    persistConversationMessage: input.persistConversationMessage ?? false,

  };



  enterOutboundValidation({

    validationName: "ChannelDispatcher.dispatch",

    layer: "dispatcher",

    file: "omnichannel-outbound-dispatch.ts",

    function: "platform.channelPlatform.dispatcher.dispatch",

    line: 182,

    requestPayload: request,

  });



  try {

    const result = await platform.channelPlatform.dispatcher.dispatch(ctx, request);

    passOutboundValidation("ChannelDispatcher.dispatch", {

      deliveryStatus: result.deliveryStatus,

      externalMessageId: result.externalMessageId ?? null,

    });

    passOutboundValidation("dispatchOmnichannelOutboundMessage.enter");

    return result;

  } catch (error) {

    mapChannelPlatformError(error);

  }

}

