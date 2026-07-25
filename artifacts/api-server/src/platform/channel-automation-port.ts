import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationChannel } from "@workspace/automation-platform";
import type { AutomationEngine, ServiceContext as AutomationServiceContext } from "@workspace/automation-platform";
import {
  buildResumeInput,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationSessionRepository,
  isSessionExpired,
  logInboundListNodeRouting,
  resolveInboundAutomationRoute,
  traceEngineResumeInput,
  traceInboundRoutingHoldResult,
  traceParsedInboundMessage,
} from "@workspace/automation-platform";
import type { ChannelAutomationPort } from "@workspace/channel-platform";
import { extractAutomationOutboundMessages, extractAutomationResponseContent } from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";

const CHANNEL_KEY_MAP: Record<string, AutomationChannel> = {
  whatsapp: "whatsapp",
  web_chat: "web_chat",
  email: "email",
  api: "api",
  messenger: "messenger",
  telegram: "telegram",
  instagram: "instagram",
  voice: "voice",
};

function mapChannelKey(channelKey: string): AutomationChannel {
  return CHANNEL_KEY_MAP[channelKey] ?? "api";
}

export function createChannelAutomationPort(
  engine: AutomationEngine,
  ctx: AutomationServiceContext,
  deps?: {
    sessions: ReturnType<typeof createSupabaseConversationSessionRepository>;
    runs: ReturnType<typeof createSupabaseAutomationRunRepository>;
  },
): ChannelAutomationPort {
  return {
    async startWorkflow(input) {
      const channel = mapChannelKey(input.channelKey);
      const resumePayload = {
        ...(input.metadata ?? {}),
      };

      if (deps) {
        const session = await deps.sessions.findActiveSession({
          companyId: input.companyId,
          channel,
          externalUserId: input.externalUserId,
        });

        const run = session
          ? session.run_id
            ? await deps.runs.findById(session.run_id)
            : await deps.runs.findBySessionId(session.id)
          : null;

        const expired = session ? isSessionExpired(session) : false;

        const route = resolveInboundAutomationRoute({
          boundFlowId: input.flowId,
          session,
          run,
          expired,
        });

        logger.info(
          {
            event: "automation.inbound_routing",
            executionMode: route.mode,
            reason: route.reason,
            workflowId: input.flowId,
            externalUserId: input.externalUserId,
            channel,
            messageTextPreview: input.messageText.slice(0, 120),
            sessionExpired: expired,
            sessionLastActivityAt: session?.last_activity_at ?? null,
            runStartedAt: run?.started_at ?? null,
            runFinishedAt: run?.finished_at ?? null,
            runWaitingInput:
              run && typeof run.variables.__waitingFor === "string" ? run.variables.__waitingFor : null,
            sessionWaitingInput:
              session && typeof session.variables.__waitingFor === "string"
                ? session.variables.__waitingFor
                : null,
            ...route.diagnostics,
          },
          "Resolved inbound automation execution mode",
        );

        logInboundListNodeRouting({
          runId: route.diagnostics.runId,
          sessionId: route.diagnostics.sessionId,
          currentNodeId: route.diagnostics.currentNodeId,
          waitingInput: route.diagnostics.waitingInput,
          sessionStatus: route.diagnostics.sessionStatus,
          runStatus: route.diagnostics.runStatus,
          executionMode: route.mode,
          reason: route.reason,
          messageTextPreview: input.messageText.slice(0, 120),
        });

        if (route.mode === "resume" && session && run) {
          const resumeInput = buildResumeInput(run, input.messageText, resumePayload);
          traceParsedInboundMessage({
            channelKey: input.channelKey,
            externalUserId: input.externalUserId,
            text: input.messageText,
            metadata: resumePayload,
          });
          traceEngineResumeInput({
            runId: run.id,
            sessionId: session.id,
            resumeInput,
          });

          const result = await engine.resume(ctx, {
            runId: run.id,
            input: resumeInput,
          });

          logger.info(
            {
              event: "automation.inbound_routing_completed",
              executionMode: "resume",
              runId: result.run.id,
              sessionId: result.session.id,
              currentNodeId: result.currentNodeId,
              lifecycle: result.lifecycle,
              waitingInput:
                typeof result.variables.__waitingFor === "string" ? result.variables.__waitingFor : null,
            },
            "Inbound automation resume completed",
          );

          const outboundMessages = extractAutomationOutboundMessages(result);
          return {
            runId: result.run.id,
            responseContent: extractAutomationResponseContent(result) ?? undefined,
            outboundMessages,
            lifecycle: result.lifecycle,
            flowVersionId: result.run.flow_version_id ?? undefined,
            resumed: true,
          };
        }

        if (route.mode === "abandon_and_start" && run) {
          await engine.abandonStaleWaitingRun(ctx, { runId: run.id });
        }

        if (route.mode === "hold_active_session") {
          traceInboundRoutingHoldResult({
            decision: route,
            runId: run?.id ?? session?.run_id ?? "",
            lifecycle: run?.status ?? session?.status,
          });

          logger.warn(
            {
              event: "automation.inbound_routing_held",
              executionMode: route.mode,
              reason: route.reason,
              runId: run?.id ?? session?.run_id ?? null,
              sessionId: session?.id ?? null,
              currentNodeId: route.diagnostics.currentNodeId,
              sessionStatus: route.diagnostics.sessionStatus,
              runStatus: route.diagnostics.runStatus,
              waitingInput: route.diagnostics.waitingInput,
            },
            "Inbound message held with no automation execution; outbound will be empty",
          );

          return {
            runId: run?.id ?? session?.run_id ?? "",
            lifecycle: run?.status ?? session?.status,
            flowVersionId: run?.flow_version_id ?? session?.flow_version_id ?? undefined,
            resumed: false,
          };
        }
      }

      const result = await engine.start(ctx, {
        companyId: input.companyId,
        flowId: input.flowId,
        channel,
        externalUserId: input.externalUserId,
        triggerSource: "inbound_message",
        initialVariables: {
          ...(input.initialVariables ?? {}),
          ...(input.metadata ?? {}),
        },
      });

      const outboundMessages = extractAutomationOutboundMessages(result);
      return {
        runId: result.run.id,
        responseContent: extractAutomationResponseContent(result) ?? undefined,
        outboundMessages,
        lifecycle: result.lifecycle,
        flowVersionId: result.run.flow_version_id ?? undefined,
        resumed: false,
      };
    },
  };
}

export function createChannelAutomationPortFromClient(
  engine: AutomationEngine,
  ctx: AutomationServiceContext,
  client: SupabaseClient,
) {
  return createChannelAutomationPort(engine, ctx, {
    sessions: createSupabaseConversationSessionRepository(client),
    runs: createSupabaseAutomationRunRepository(client),
  });
}

export function createChannelWorkflowFlowValidator(client: SupabaseClient) {
  return {
    async isExecutableFlow(flowId: string, companyId: string): Promise<boolean> {
      const { data, error } = await client
        .from("automation_flows")
        .select("id, company_id, status")
        .eq("id", flowId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return Boolean(data && data.company_id === companyId && data.status === "active");
    },
  };
}
