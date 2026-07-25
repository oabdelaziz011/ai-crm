import { AUTOMATION_PERMISSIONS } from "../constants.js";
import type { AutomationChannel, OrchestratorTriggerType } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { CustomerResolverPort } from "../ports/customer-resolver-port.js";
import type {
  AutomationRunRepository,
  ConversationMessageRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type {
  AutomationExecutionResult,
  NormalizedOutboundMessage,
  OrchestratorHandleResult,
  ServiceContext,
  TriggerDispatchInput,
} from "../types.js";
import type { AutomationEngine } from "../engine/automation-engine.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import type { ChannelAdapter, ChannelAdapterRegistry } from "./channel-adapter.js";
import { ConversationResolver } from "./conversation-resolver.js";
import {
  buildResumeInput,
  canResumeWaitingRun,
  isStaleWaitingRun,
  DEFAULT_SESSION_POLICY,
  shouldStartNewConversation,
  type SessionPolicyConfig,
} from "./session-policy.js";
import { TriggerDispatcher } from "./trigger-dispatcher.js";
import {
  outboundEntryDisplayText,
  readLatestOutbound,
  readOutboundQueue,
} from "../runtime/outbound-queue.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

export class ConversationOrchestrator {
  private readonly resolver: ConversationResolver;
  private readonly dispatcher: TriggerDispatcher;

  constructor(
    private readonly deps: {
      adapters: ChannelAdapterRegistry;
      flows: AutomationFlowRepository;
      sessions: ConversationSessionRepository;
      runs: AutomationRunRepository;
      messages: ConversationMessageRepository;
      customers: CustomerResolverPort;
      engine: AutomationEngine;
      policy?: SessionPolicyConfig;
    },
  ) {
    this.resolver = new ConversationResolver({
      sessions: deps.sessions,
      runs: deps.runs,
      messages: deps.messages,
      customers: deps.customers,
      policy: deps.policy,
    });
    this.dispatcher = new TriggerDispatcher({
      flows: deps.flows,
      engine: deps.engine,
    });
  }

  getAdapter(channel: AutomationChannel): ChannelAdapter {
    return this.deps.adapters.get(channel);
  }

  async handleInbound(
    ctx: ServiceContext,
    input: { companyId: string; channel: AutomationChannel; rawMessage: unknown },
  ): Promise<OrchestratorHandleResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);
    const adapter = this.getAdapter(input.channel);
    const inbound = await adapter.receive(input.rawMessage, input.companyId);
    return this.processInbound(ctx, inbound);
  }

  async processInbound(ctx: ServiceContext, inbound: ReturnType<ChannelAdapter["normalize"]>): Promise<OrchestratorHandleResult> {
    let resolution = await this.resolver.resolve(ctx, inbound);
    const outboundMessages: NormalizedOutboundMessage[] = [];
    let execution: AutomationExecutionResult | null = null;

    if (resolution.session) {
      await this.resolver.recordInboundMessage(resolution.session.id, inbound);
    }

    if (
      resolution.session &&
      resolution.run &&
      canResumeWaitingRun(resolution.session, resolution.run, this.deps.policy ?? DEFAULT_SESSION_POLICY)
    ) {
      execution = await this.deps.engine.resume(ctx, {
        runId: resolution.run.id,
        input: buildResumeInput(resolution.run, inbound.text, inbound.payload),
      });
      outboundMessages.push(...this.buildOutboundMessages(execution, inbound));
      return { inbound, resolution, execution, outboundMessages };
    }

    if (
      resolution.session &&
      resolution.run &&
      isStaleWaitingRun(resolution.session, resolution.run, this.deps.policy ?? DEFAULT_SESSION_POLICY)
    ) {
      await this.deps.engine.abandonStaleWaitingRun(ctx, { runId: resolution.run.id });
      resolution = {
        ...resolution,
        session: null,
        run: null,
        created: false,
        expired: true,
      };
    }

    if (!shouldStartNewConversation(resolution.session, resolution.run, resolution.expired)) {
      if (resolution.session) {
        await this.resolver.touchSession(resolution.session, {
          ...resolution.session.variables,
          lastMessage: inbound.text,
        });
      }
      return { inbound, resolution, execution: null, outboundMessages };
    }

    const trigger: OrchestratorTriggerType = resolution.created || resolution.expired ? "new_conversation" : "incoming_message";
    execution = await this.dispatcher.dispatch(ctx, {
      companyId: resolution.companyId,
      channel: inbound.channel,
      trigger,
      externalUserId: inbound.externalUserId,
      customerId: resolution.customerId,
      triggerSource: trigger,
      initialVariables: {
        customerId: resolution.customerId,
        lastMessage: inbound.text,
        ...inbound.payload,
      },
    });

    await this.resolver.recordInboundMessage(execution.session.id, inbound);
    outboundMessages.push(...this.buildOutboundMessages(execution, inbound));

    return { inbound, resolution, execution, outboundMessages };
  }

  async startManual(
    ctx: ServiceContext,
    input: Omit<TriggerDispatchInput, "trigger"> & { flowId: string },
  ): Promise<AutomationExecutionResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);
    if (!input.flowId) throw new ValidationError("flowId is required for manual start.");
    return this.dispatcher.dispatch(ctx, {
      ...input,
      trigger: "manual_start",
      triggerSource: "manual_start",
    });
  }

  async triggerApi(ctx: ServiceContext, input: TriggerDispatchInput): Promise<AutomationExecutionResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);
    return this.dispatcher.dispatch(ctx, {
      ...input,
      trigger: "api_trigger",
      triggerSource: input.triggerSource ?? "api_trigger",
    });
  }

  private buildOutboundMessages(
    execution: AutomationExecutionResult,
    inbound: { companyId: string; channel: AutomationChannel; externalUserId: string },
  ): NormalizedOutboundMessage[] {
    const queue = readOutboundQueue(execution.variables);
    if (queue.length > 0) {
      return queue.map((entry) => {
        const kind = entry.kind;
        const text = outboundEntryDisplayText(entry);
        const isInteractive = kind === "buttons" || kind === "list";
        return {
          channel: inbound.channel,
          companyId: inbound.companyId,
          sessionId: execution.session.id,
          externalUserId: inbound.externalUserId,
          messageType: isInteractive ? "payload" : "text",
          text,
          payload: entry as Record<string, unknown>,
        };
      });
    }

    return this.buildLegacyPromptOutbounds(execution, inbound);
  }

  /** @deprecated fallback for runs persisted before the outbound queue existed */
  private buildLegacyPromptOutbounds(
    execution: AutomationExecutionResult,
    inbound: { companyId: string; channel: AutomationChannel; externalUserId: string },
  ): NormalizedOutboundMessage[] {
    if (execution.lifecycle !== "waiting_input") return [];

    const outbound = readLatestOutbound(execution.variables);
    if (outbound) {
      const kind = outbound.kind;
      if (kind === "buttons" || kind === "list") {
        const text = outboundEntryDisplayText(outbound);
        return [
          {
            channel: inbound.channel,
            companyId: inbound.companyId,
            sessionId: execution.session.id,
            externalUserId: inbound.externalUserId,
            messageType: "payload",
            text,
            payload: outbound as Record<string, unknown>,
          },
        ];
      }
    }

    const prompt = execution.variables.__prompt;
    if (typeof prompt !== "string" || !prompt.trim()) return [];
    return [
      {
        channel: inbound.channel,
        companyId: inbound.companyId,
        sessionId: execution.session.id,
        externalUserId: inbound.externalUserId,
        messageType: "text",
        text: prompt,
        payload: { kind: "automation_prompt" },
      },
    ];
  }
}
