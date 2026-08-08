import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationChannel } from "@workspace/automation-platform";
import type { AutomationEngine, ServiceContext as AutomationServiceContext } from "@workspace/automation-platform";
import {
  ABANDONED_ACTIVE_RUN_REASON,
  buildResumeInput,
  cleanupStaleExecutionsForUser,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationSessionRepository,
  logInboundListNodeRouting,
  resolveInboundAutomationContext,
  resolveInboundAutomationRoute,
  traceEngineResumeInput,
  traceInboundRoutingHoldResult,
  traceInboundRoutingLookup,
  traceParsedInboundMessage,
} from "@workspace/automation-platform";
import {
  runWithWorkflowXRay,
  setWorkflowXRay,
  WorkflowXRay,
} from "@workspace/automation-platform/server";
import type { ChannelAutomationPort } from "@workspace/channel-platform";
import { extractAutomationOutboundMessages, extractAutomationResponseContent } from "@workspace/channel-platform";
import { getWhatsAppRequestCache, getWhatsAppConversationTrace } from "@workspace/channel-platform/server";
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

function readWaitingFor(source: { variables: Record<string, unknown> } | null | undefined): string | null {
  if (!source) return null;
  return typeof source.variables.__waitingFor === "string" ? source.variables.__waitingFor : null;
}

function logInboundRoutingDecision(payload: Record<string, unknown>): void {
  logger.info(payload, "automation inbound routing decision");
  console.info(JSON.stringify({ event: "automation.inbound_routing_decision", ...payload }));
}

export function createChannelAutomationPort(
  engine: AutomationEngine,
  ctx: AutomationServiceContext,
  deps?: {
    sessions: ReturnType<typeof createSupabaseConversationSessionRepository>;
    runs: ReturnType<typeof createSupabaseAutomationRunRepository>;
  },
): ChannelAutomationPort {
  const startWorkflowImpl = async (input: Parameters<ChannelAutomationPort["startWorkflow"]>[0]) => {
      const channel = mapChannelKey(input.channelKey);
      const resumePayload = {
        ...(input.metadata ?? {}),
      };
      let session: Awaited<ReturnType<NonNullable<typeof deps>["sessions"]["findById"]>> = null;
      let run: Awaited<ReturnType<NonNullable<typeof deps>["runs"]["findById"]>> = null;
      let route: ReturnType<typeof resolveInboundAutomationRoute> | undefined;

      if (deps) {
        await cleanupStaleExecutionsForUser(engine, ctx, deps, {
          companyId: input.companyId,
          channel,
          externalUserId: input.externalUserId,
          boundFlowId: input.flowId,
        });

        const context = await resolveInboundAutomationContext(deps, {
          companyId: input.companyId,
          channel,
          externalUserId: input.externalUserId,
          boundFlowId: input.flowId,
        });
        session = context.session;
        run = context.run;
        const expired = context.expired;

        traceInboundRoutingLookup({
          externalUserId: input.externalUserId,
          channel,
          boundFlowId: input.flowId,
          lookup: context.lookup,
          session,
          run,
          expired,
          inboundKind: typeof resumePayload.kind === "string" ? resumePayload.kind : null,
          interactionType:
            typeof resumePayload.interactionType === "string" ? resumePayload.interactionType : null,
          replyId: typeof resumePayload.replyId === "string" ? resumePayload.replyId : null,
        });

        const routeDecision = resolveInboundAutomationRoute({
          boundFlowId: input.flowId,
          session,
          run,
          expired,
        });
        route = routeDecision;

        logger.info(
          {
            event: "automation.inbound_routing",
            executionMode: routeDecision.mode,
            reason: routeDecision.reason,
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
            ...routeDecision.diagnostics,
            lookupStrategy: context.lookup.strategy,
            skippedExpiredSessionIds: context.lookup.skippedExpiredSessionIds,
            willStartNewWorkflow: routeDecision.mode === "start" || routeDecision.mode === "abandon_and_start",
          },
          routeDecision.mode === "start"
            ? "Starting new workflow — prior session not resumable"
            : routeDecision.mode === "abandon_and_start"
              ? "Abandoning stale waiting run and starting new workflow"
              : "Resolved inbound automation execution mode",
        );

        logInboundListNodeRouting({
          runId: routeDecision.diagnostics.runId,
          sessionId: routeDecision.diagnostics.sessionId,
          currentNodeId: routeDecision.diagnostics.currentNodeId,
          waitingInput: routeDecision.diagnostics.waitingInput,
          sessionStatus: routeDecision.diagnostics.sessionStatus,
          runStatus: routeDecision.diagnostics.runStatus,
          executionMode: routeDecision.mode,
          reason: routeDecision.reason,
          messageTextPreview: input.messageText.slice(0, 120),
        });

        logInboundRoutingDecision({
          executionMode: routeDecision.mode,
          routingReason: routeDecision.reason,
          sessionId: session?.id ?? routeDecision.diagnostics.sessionId ?? null,
          runId: run?.id ?? routeDecision.diagnostics.runId ?? null,
          currentNodeId: run?.current_node_id ?? session?.current_node_id ?? routeDecision.diagnostics.currentNodeId ?? null,
          waitingFor: readWaitingFor(run) ?? readWaitingFor(session) ?? routeDecision.diagnostics.waitingInput ?? null,
          flowVersionId: run?.flow_version_id ?? session?.flow_version_id ?? null,
          sessionStatus: session?.status ?? null,
          runStatus: run?.status ?? null,
          sessionExpired: expired,
          lookupStrategy: context.lookup.strategy,
          skippedExpiredSessionIds: context.lookup.skippedExpiredSessionIds,
          inboundKind: typeof resumePayload.kind === "string" ? resumePayload.kind : null,
          interactionType:
            typeof resumePayload.interactionType === "string" ? resumePayload.interactionType : null,
          replyId: typeof resumePayload.replyId === "string" ? resumePayload.replyId : null,
          replyTitle: typeof resumePayload.title === "string" ? resumePayload.title : null,
          externalUserId: input.externalUserId,
          boundFlowId: input.flowId,
          engineResumeCalled: false,
          engineStartCalled: false,
          resumeGatePassed: Boolean(routeDecision.mode === "resume" && session && run),
        });

        if (routeDecision.mode === "resume" && session && run) {
          logInboundRoutingDecision({
            executionMode: routeDecision.mode,
            routingReason: routeDecision.reason,
            sessionId: session.id,
            runId: run.id,
            currentNodeId: run.current_node_id ?? session.current_node_id,
            waitingFor: readWaitingFor(run) ?? readWaitingFor(session),
            flowVersionId: run.flow_version_id ?? session.flow_version_id,
            engineResumeCalled: true,
            engineStartCalled: false,
            resumeGatePassed: true,
          });

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

        if (routeDecision.mode === "abandon_and_start" && run) {
          await engine.abandonActiveRun(ctx, {
            runId: run.id,
            reason: ABANDONED_ACTIVE_RUN_REASON,
          });
        }

        if (routeDecision.mode === "hold_active_session") {
          logInboundRoutingDecision({
            executionMode: routeDecision.mode,
            routingReason: routeDecision.reason,
            sessionId: session?.id ?? null,
            runId: run?.id ?? null,
            currentNodeId: routeDecision.diagnostics.currentNodeId,
            waitingFor: routeDecision.diagnostics.waitingInput,
            flowVersionId: run?.flow_version_id ?? session?.flow_version_id ?? null,
            engineResumeCalled: false,
            engineStartCalled: false,
            startSelectedBecause: "channel-automation-port.ts hold_active_session early return",
          });

          traceInboundRoutingHoldResult({
            decision: routeDecision,
            runId: run?.id ?? session?.run_id ?? "",
            lifecycle: run?.status ?? session?.status,
          });

          logger.warn(
            {
              event: "automation.inbound_routing_held",
              executionMode: routeDecision.mode,
              reason: routeDecision.reason,
              runId: run?.id ?? session?.run_id ?? null,
              sessionId: session?.id ?? null,
              currentNodeId: routeDecision.diagnostics.currentNodeId,
              sessionStatus: routeDecision.diagnostics.sessionStatus,
              runStatus: routeDecision.diagnostics.runStatus,
              waitingInput: routeDecision.diagnostics.waitingInput,
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

      let startSelectedBecause = "channel-automation-port.ts engine.start()";
      if (!deps) {
        startSelectedBecause =
          "channel-automation-port.ts engine.start() — deps undefined (no session/run repositories; resume routing disabled)";
      } else if (route?.mode === "start") {
        startSelectedBecause = `channel-automation-port.ts engine.start() — resolveInboundAutomationRoute returned mode=start reason=${route.reason}`;
      } else if (route?.mode === "abandon_and_start") {
        startSelectedBecause = `channel-automation-port.ts engine.start() — resolveInboundAutomationRoute returned mode=abandon_and_start reason=${route.reason}`;
      } else if (route?.mode === "resume" && (!session || !run)) {
        startSelectedBecause =
          "channel-automation-port.ts engine.start() — route.mode=resume but session or run missing after lookup";
      } else if (route?.mode === "resume") {
        startSelectedBecause =
          "channel-automation-port.ts engine.start() — unexpected fallthrough after route.mode=resume";
      } else if (route) {
        startSelectedBecause = `channel-automation-port.ts engine.start() — fallthrough after mode=${route.mode}`;
      }

      logInboundRoutingDecision({
        executionMode: route?.mode ?? "start",
        routingReason: route?.reason ?? (deps ? "unknown_fallthrough" : "no_routing_deps"),
        sessionId: session?.id ?? null,
        runId: run?.id ?? null,
        currentNodeId: run?.current_node_id ?? session?.current_node_id ?? null,
        waitingFor: readWaitingFor(run) ?? readWaitingFor(session),
        flowVersionId: run?.flow_version_id ?? session?.flow_version_id ?? null,
        engineResumeCalled: false,
        engineStartCalled: true,
        startSelectedBecause,
      });

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
  };

  return {
    async startWorkflow(input) {
      const xray = new WorkflowXRay(
        typeof input.externalMessageId === "string" && input.externalMessageId.trim()
          ? input.externalMessageId
          : `workflow-${input.companyId}-${Date.now()}`,
      );
      return runWithWorkflowXRay(xray, async () => {
        xray.beginWorkflow({
          companyId: input.companyId,
          flowId: input.flowId,
          channelKey: input.channelKey,
          externalUserId: input.externalUserId,
        });
        let result: Awaited<ReturnType<typeof startWorkflowImpl>> | undefined;
        try {
          result = await startWorkflowImpl(input);
          return result;
        } finally {
          xray.endWorkflow();
          const cache = getWhatsAppRequestCache();
          // Observability only: fold X-Ray timings into the inbound conversation TRACE.
          try {
            const snap = xray.getValidationSnapshot();
            const conv = getWhatsAppConversationTrace();
            if (conv) {
              conv.setWorkflowTime(snap.totalWorkflowMs);
              conv.bindWorkflow(input.flowId);
              if (result?.runId) conv.bindAutomationRun(result.runId);
            }
          } catch {
            // never fail the workflow for observability
          }
          xray.printSprint23Validation({
            label: "measured",
            cacheHits: cache?.totalHits() ?? 0,
            cacheMisses: cache?.totalMisses() ?? 0,
          });
          try {
            xray.printReport();
          } catch {
            // Measurement-only: never fail the workflow because the report printer threw.
          }
          setWorkflowXRay(null);
        }
      });
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
      const metadata = await this.getExecutionMetadata(flowId, companyId);
      return Boolean(metadata && metadata.flowStatus === "active");
    },

    async getExecutionMetadata(
      flowId: string,
      companyId: string,
    ): Promise<{
      workflowId: string;
      automationFlowId: string;
      publishedVersionId: string | null;
      publishedVersionNumber: number | null;
      hasUnpublishedDraft: boolean;
      flowStatus: string;
      bindingUsesPublishedVersion: boolean;
    } | null> {
      const { data, error } = await client
        .from("automation_flows")
        .select("id, company_id, status, version, active_version_id, has_unpublished_draft")
        .eq("id", flowId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data || data.company_id !== companyId) return null;

      return {
        workflowId: data.id,
        automationFlowId: data.id,
        publishedVersionId: data.active_version_id ?? null,
        publishedVersionNumber: typeof data.version === "number" ? data.version : null,
        hasUnpublishedDraft: data.has_unpublished_draft === true,
        flowStatus: data.status,
        bindingUsesPublishedVersion: Boolean(data.active_version_id),
      };
    },
  };
}
