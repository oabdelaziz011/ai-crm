import type { AutomationChannel, AutomationTriggerType, OrchestratorTriggerType } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { CustomerResolverPort } from "../ports/customer-resolver-port.js";
import type {
  AutomationRunRepository,
  ConversationMessageRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type {
  AutomationRunRecord,
  ConversationResolution,
  ConversationSessionRecord,
  NormalizedInboundMessage,
  ServiceContext,
} from "../types.js";
import {
  DEFAULT_SESSION_POLICY,
  isSessionExpired,
  type SessionPolicyConfig,
} from "./session-policy.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError("automation.view");
}

export class ConversationResolver {
  constructor(
    private readonly deps: {
      sessions: ConversationSessionRepository;
      runs: AutomationRunRepository;
      messages: ConversationMessageRepository;
      customers: CustomerResolverPort;
      policy?: SessionPolicyConfig;
    },
  ) {}

  linkCompany(ctx: ServiceContext, companyId: string): string {
    if (!companyId.trim()) throw new ValidationError("Company id is required.");
    assertCompanyAccess(ctx, companyId);
    return companyId;
  }

  async resolveCustomer(inbound: NormalizedInboundMessage): Promise<string | null> {
    if (inbound.customerId) return inbound.customerId;
    return this.deps.customers.resolveCustomer({
      companyId: inbound.companyId,
      channel: inbound.channel,
      externalUserId: inbound.externalUserId,
    });
  }

  async findActiveSession(input: {
    companyId: string;
    channel: AutomationChannel;
    externalUserId: string;
  }): Promise<ConversationSessionRecord | null> {
    return this.deps.sessions.findActiveSession(input);
  }

  async loadRunForSession(session: ConversationSessionRecord): Promise<AutomationRunRecord | null> {
    if (session.run_id) {
      const byId = await this.deps.runs.findById(session.run_id);
      if (byId) return byId;
    }
    return this.deps.runs.findBySessionId(session.id);
  }

  async expireSession(session: ConversationSessionRecord): Promise<ConversationSessionRecord> {
    return this.deps.sessions.updateState({
      sessionId: session.id,
      status: "expired",
      metadata: {
        ...session.metadata,
        expiredAt: new Date().toISOString(),
      },
    });
  }

  async touchSession(
    session: ConversationSessionRecord,
    variables?: Record<string, unknown>,
  ): Promise<ConversationSessionRecord> {
    return this.deps.sessions.updateState({
      sessionId: session.id,
      variables: variables ?? session.variables,
      lastActivityAt: new Date().toISOString(),
    });
  }

  async recordInboundMessage(
    sessionId: string,
    inbound: NormalizedInboundMessage,
  ): Promise<void> {
    await this.deps.messages.create({
      sessionId,
      senderType: "user",
      messageType: inbound.messageType,
      payload: {
        text: inbound.text,
        externalMessageId: inbound.externalMessageId,
        ...inbound.payload,
      },
    });
  }

  async resolve(ctx: ServiceContext, inbound: NormalizedInboundMessage): Promise<ConversationResolution> {
    const companyId = this.linkCompany(ctx, inbound.companyId);
    const customerId = await this.resolveCustomer(inbound);
    const policy = this.deps.policy ?? DEFAULT_SESSION_POLICY;

    let session = await this.findActiveSession({
      companyId,
      channel: inbound.channel,
      externalUserId: inbound.externalUserId,
    });
    let expired = false;

    if (session && policy.expireInactiveSessions && isSessionExpired(session, new Date(), policy.timeoutMs)) {
      await this.expireSession(session);
      expired = true;
      session = null;
    }

    const run = session ? await this.loadRunForSession(session) : null;

    return {
      companyId,
      customerId,
      session,
      run,
      expired,
      created: !session,
    };
  }
}

export function mapOrchestratorTriggerToFlowTrigger(
  trigger: OrchestratorTriggerType,
): AutomationTriggerType {
  switch (trigger) {
    case "new_conversation":
    case "incoming_message":
      return "inbound_message";
    case "manual_start":
      return "manual";
    case "api_trigger":
      return "api_event";
    default:
      return "manual";
  }
}
