/**
 * Trace outbound WhatsApp delivery for "Choose suitable time" list after date selection.
 * Uses the same api-server webhook platform wiring with instrumented Graph API fetch.
 *
 * Run from lib/automation-platform:
 *   TSX_TSCONFIG_PATH=../../artifacts/login-app/tsconfig.json node --import tsx/esm ../../scripts/trace-whatsapp-outbound-delivery.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const WA_USER = "201023169075";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";
const TIMES_LIST_TITLE = "Choose suitable time";

const env: Record<string, string> = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
process.env.VITE_SUPABASE_URL ??= env.SUPABASE_URL;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??=
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;

type MetaHttpCapture = {
  timestamp: string;
  endpoint: string;
  httpRequestBody: unknown;
  httpStatus: number;
  httpResponseBody: unknown;
  whatsappMessageId: string | null;
  metaError: string | null;
  sendFunction: string;
  sendFile: string;
  sendLine: number;
};

const metaCaptures: MetaHttpCapture[] = [];
let postDispatchExceptions: Array<{ stage: string; message: string; stack: string | null }> = [];

function print(section: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ trace: "whatsapp_outbound_delivery", section, ...data }, null, 2));
}

function redactToken(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const h = headers instanceof Headers ? Object.fromEntries(headers.entries()) : (headers as Record<string, string>);
  for (const [k, v] of Object.entries(h)) {
    out[k] = k.toLowerCase() === "authorization" ? "Bearer [REDACTED]" : String(v);
  }
  return out;
}

function createInstrumentedFetch(): typeof fetch {
  const baseFetch = globalThis.fetch.bind(globalThis);
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isGraphMessages = url.includes("graph.facebook.com") && url.includes("/messages");
    let requestBody: unknown = null;
    if (init?.body && typeof init.body === "string") {
      try {
        requestBody = JSON.parse(init.body);
      } catch {
        requestBody = init.body;
      }
    }

    let response: Response;
    let caught: unknown = null;
    try {
      response = await baseFetch(input, init);
    } catch (error) {
      caught = error;
      throw error;
    }

    if (isGraphMessages) {
      const cloned = response.clone();
      let responseBody: unknown = null;
      try {
        responseBody = await cloned.json();
      } catch {
        responseBody = await cloned.text();
      }

      const interactive = (requestBody as { interactive?: { type?: string; header?: { text?: string } } })?.interactive;
      const listHeader =
        interactive?.type === "list"
          ? (interactive.header as { text?: string } | undefined)?.text ??
            (requestBody as { interactive?: { body?: { text?: string } } })?.interactive?.body?.text
          : null;

      const isTimesList =
        interactive?.type === "list" &&
        (listHeader === TIMES_LIST_TITLE ||
          JSON.stringify(requestBody).includes(TIMES_LIST_TITLE));

      if (isTimesList || metaCaptures.length === 0) {
        const messages = (responseBody as { messages?: Array<{ id?: string }> })?.messages;
        const errorMsg =
          (responseBody as { error?: { message?: string; error_user_msg?: string } })?.error?.error_user_msg ??
          (responseBody as { error?: { message?: string } })?.error?.message ??
          null;

        metaCaptures.push({
          timestamp: new Date().toISOString(),
          endpoint: url,
          httpRequestBody: requestBody,
          httpStatus: response.status,
          httpResponseBody: responseBody,
          whatsappMessageId: messages?.[0]?.id ?? null,
          metaError: errorMsg,
          sendFunction: "WhatsAppApiClient.sendMessage",
          sendFile: "lib/channel-platform/src/adapters/whatsapp/whatsapp-api-client.ts",
          sendLine: 41,
        });
      }
    }

    if (caught) throw caught;
    return response!;
  };
}

function verifyApiServerBundle() {
  const distPath = resolve(root, "artifacts/api-server/dist/main.mjs");
  const pkg = JSON.parse(readFileSync(resolve(root, "artifacts/api-server/package.json"), "utf8"));
  const stat = statSync(distPath);
  const bundle = readFileSync(distPath, "utf8");
  let gitCommit = "unknown";
  try {
    gitCommit = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {}
  const hasDateFix = bundle.includes('key === "date"') && bundle.includes("record2.date");
  const sourcePaths = [
    "../../lib/automation-platform/src/runtime/lookup-filter-resolver.ts",
    "../../lib/channel-platform/src/adapters/whatsapp/whatsapp-api-client.ts",
    "../../artifacts/login-app/src/lib/lookups/create-lookup-options-port.ts",
  ].map((p) => ({ path: p, present: bundle.includes(p) }));

  print("build_verification", {
    gitCommitHash: gitCommit,
    buildTimestamp: stat.mtime.toISOString(),
    packageName: pkg.name,
    packageVersion: pkg.version,
    distEntrypoint: distPath,
    bundleSizeBytes: stat.size,
    lookupFilterResolverFixPresent: hasDateFix,
    resolvedSourcePathsAtBundleTime: sourcePaths,
  });

  return hasDateFix;
}

async function main() {
  const hasFix = verifyApiServerBundle();
  if (!hasFix) {
    print("build_verification_failed", {
      action: "Rebuild required — lookup-filter-resolver date extraction missing from dist/main.mjs",
    });
    process.exit(1);
  }

  const { abandonAllActiveExecutionsForUser, createSupabaseAutomationRunRepository, createSupabaseConversationSessionRepository, resolveCompanyActorUserId } =
    await import("../lib/automation-platform/src/index.ts");
  const { createWebhookAutomationPlatformServices } = await import(
    "../artifacts/api-server/src/platform/create-webhook-automation-services.ts"
  );
  const { createChannelAutomationPortFromClient } = await import(
    "../artifacts/api-server/src/platform/channel-automation-port.ts"
  );
  const { createChannelPlatformPortsWithContext } = await import(
    "../artifacts/login-app/src/lib/channel-platform/platform-ports.ts"
  );
  const { createServerChannelPlatformServices, createSupabaseWhatsAppCredentialsLoader } = await import("../lib/channel-platform/src/index.ts");
  const { createConversationServices } = await import("../lib/ai-conversation/src/index.ts");
  const { createChannelRegistryServices } = await import("../lib/channel-registry/src/index.ts");
  const { ChannelWorkflowResolver } = await import("../lib/channel-platform/src/services/channel-workflow-resolver.ts");
  const { createSupabaseChannelWorkflowBindingRepository } = await import(
    "../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts"
  );
  const { createChannelWorkflowFlowValidator } = await import(
    "../artifacts/api-server/src/platform/channel-automation-port.ts"
  );

  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: PLATFORM_OWNER,
    password: DEMO_PASSWORD,
  });
  if (authError) throw authError;
  await client.rpc("_demo_set_triggers", { enabled: false });

  const { data: flow } = await client.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const { data: channel } = await client.from("company_channels").select("*").eq("id", CHANNEL_ID).single();
  const { data: assistantRow } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", flow!.company_id)
    .limit(1)
    .maybeSingle();

  const companyId = flow!.company_id as string;
  const phoneNumberId = String(channel!.configuration?.phoneNumberId ?? "");
  const ctx = { userId: auth.user!.id, companyId, isSuperAdmin: true, hasPermission: () => true };

  const sessionsRepo = createSupabaseConversationSessionRepository(client);
  const runsRepo = createSupabaseAutomationRunRepository(client);
  const routingDeps = { sessions: sessionsRepo, runs: runsRepo };

  const automationPlatform = createWebhookAutomationPlatformServices(client);
  const conversationServices = createConversationServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);

  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPortFromClient(
    automationPlatform.engine,
    ctx as never,
    client,
  );

  const whatsAppCredentialsLoader = createSupabaseWhatsAppCredentialsLoader(client);

  const channelPlatform = createServerChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: createInstrumentedFetch(),
    whatsAppCredentialsLoader,
    whatsAppOutboundDiagnostic: (detail) =>
      print("whatsapp_outbound_diagnostic", detail as Record<string, unknown>),
    workflowResolver: new ChannelWorkflowResolver({
      bindings: createSupabaseChannelWorkflowBindingRepository(client),
      flowValidator: createChannelWorkflowFlowValidator(client),
    }),
  });

  await abandonAllActiveExecutionsForUser(
    automationPlatform.engine,
    ctx as never,
    routingDeps,
    { companyId, channel: "whatsapp", externalUserId: WA_USER, boundFlowId: FLOW_ID, reason: "outbound_trace_clean_slate" },
  );

  function waPayload(
    message:
      | { type: "text"; body: string }
      | { type: "button"; id: string; title: string }
      | { type: "list"; id: string; title: string },
  ) {
    const msgId = `wamid.outtrace.${randomUUID()}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const base = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: phoneNumberId },
                contacts: [{ profile: { name: "Outbound Trace" }, wa_id: WA_USER }],
                messages: [] as unknown[],
              },
            },
          ],
        },
      ],
    };
    if (message.type === "text") {
      base.entry[0].changes[0].value.messages = [
        { from: WA_USER, id: msgId, timestamp: ts, type: "text", text: { body: message.body } },
      ];
    } else if (message.type === "button") {
      base.entry[0].changes[0].value.messages = [
        {
          from: WA_USER,
          id: msgId,
          timestamp: ts,
          type: "interactive",
          interactive: { type: "button_reply", button_reply: { id: message.id, title: message.title } },
        },
      ];
    } else {
      base.entry[0].changes[0].value.messages = [
        {
          from: WA_USER,
          id: msgId,
          timestamp: ts,
          type: "interactive",
          interactive: { type: "list_reply", list_reply: { id: message.id, title: message.title } },
        },
      ];
    }
    return base;
  }

  async function route(step: string, payload: ReturnType<typeof waPayload>) {
    print("inbound_step", { step });
    let result: Awaited<ReturnType<typeof channelPlatform.router.routeWebhook>> | null = null;
    try {
      result = await channelPlatform.router.routeWebhook(ctx as never, {
        companyId,
        companyChannelId: CHANNEL_ID,
        channelKey: "whatsapp",
        rawPayload: payload,
        executeAi: false,
        aiAssistantId: assistantRow!.id,
      });
    } catch (error) {
      postDispatchExceptions.push({
        stage: `routeWebhook:${step}`,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }
    return result;
  }

  // Fast-forward to dates list
  await route("Hello", waPayload({ type: "text", body: "Hello" }));
  await route("Book", waPayload({ type: "button", id: "book", title: "Book Appointment" }));
  await route("Phone", waPayload({ type: "text", body: "01011404109" }));
  await route("Service", waPayload({ type: "list", id: "a8a6403e-4c88-48ae-aa46-d204ea8ef49d", title: "عيادة" }));
  await route("Doctor", waPayload({ type: "list", id: "1c766372-7726-4cb6-b660-b88ae85fb49c", title: "ADAM" }));

  metaCaptures.length = 0;

  // Date selection — triggers times list outbound
  let dateRouteResult: Awaited<ReturnType<typeof route>> = null;
  try {
    dateRouteResult = await route("Date", waPayload({ type: "list", id: "2026-08-02", title: "Sun, Aug 2, 2026" }));
  } catch (error) {
    postDispatchExceptions.push({
      stage: "date_selection_route",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
  }

  const runId =
    dateRouteResult?.kind === "inbound"
      ? (dateRouteResult.result?.automationRunId as string | undefined)
      : undefined;

  const timesCapture =
    metaCaptures.find((c) => JSON.stringify(c.httpRequestBody).includes(TIMES_LIST_TITLE)) ??
    metaCaptures[metaCaptures.length - 1] ??
    null;

  let deliveryEvents: unknown[] = [];
  if (runId) {
    const { data: deliveries } = await client
      .from("channel_delivery_events")
      .select("id,delivery_status,external_message_id,error_message,payload,created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    deliveryEvents = (deliveries ?? []).filter((d) => {
      const payload = d.payload as { outboundPayload?: { title?: string } } | null;
      return payload?.outboundPayload?.title === TIMES_LIST_TITLE || JSON.stringify(d.payload).includes(TIMES_LIST_TITLE);
    });
  }

  if (!timesCapture) {
    print("outbound_delivery_missing", {
      metaCallsObserved: metaCaptures.length,
      postDispatchExceptions,
      note: "No Graph API /messages call captured for Choose suitable time list",
    });
    process.exit(1);
  }

  const outboundPayloadFromEngine = (() => {
    const req = timesCapture.httpRequestBody as {
      interactive?: { header?: { text?: string }; body?: { text?: string }; action?: { sections?: unknown[] } };
    };
    if (req?.interactive?.type === "list") return req;
    return timesCapture.httpRequestBody;
  })();

  print("outbound_delivery_report", {
    "1_exact_outbound_payload": outboundPayloadFromEngine,
    "2_send_function": `${timesCapture.sendFunction} → WhatsAppCloudAdapter.sendOutbound (whatsapp-cloud-adapter.ts:257) → OutboundMessagePipeline.process (outbound-message-pipeline.ts:79) → dispatchAutomationOutboundMessages (dispatch-automation-outbound.ts:51)`,
    "3_http_request_body": timesCapture.httpRequestBody,
    "4_http_response": timesCapture.httpResponseBody,
    "5_http_status_code": timesCapture.httpStatus,
    "6_meta_response_body": timesCapture.httpResponseBody,
    "7_whatsapp_message_id": timesCapture.whatsappMessageId,
    "8_delivery_error": timesCapture.metaError,
    "9_exceptions_after_outbound_dispatch": postDispatchExceptions,
    "10_reached_meta_successfully": timesCapture.httpStatus >= 200 && timesCapture.httpStatus < 300 && Boolean(timesCapture.whatsappMessageId),
    graphEndpoint: timesCapture.endpoint,
    deliveryEventsFromDb: deliveryEvents,
    runId: runId ?? null,
  });
}

main().catch((error) => {
  print("fatal", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
  process.exit(1);
});
