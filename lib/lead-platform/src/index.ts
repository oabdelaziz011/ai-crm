import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AssignmentGovernanceService,
  createAssignmentGovernancePort,
  createSupabaseAssignmentGovernanceDataPort,
} from "@workspace/assignment-governance";
import {
  AssignmentAuditService,
  createAssignmentAuditPort,
  createNoopAssignmentAuditPort,
  createSupabaseAssignmentAuditDataPort,
  type AssignmentAuditPort,
} from "@workspace/assignment-audit";
import { InMemoryLeadQueryCache } from "./cache/in-memory-lead-query-cache.js";
import type { LeadQueryCachePort } from "./cache/lead-query-cache-port.js";
import { createLeadReadPort } from "./adapters/lead-query-read-port.js";
import type { LeadReadPort } from "./ports/lead-read-port.js";
import type {
  LeadAssigneeResolverPort,
  LeadAuditPort,
  LeadConversionPort,
  LeadEventPublisherPort,
  LeadNotificationPort,
  LeadOpportunityConversionPort,
} from "./ports/lead-platform-ports.js";
import {
  createNoopLeadAssigneeResolverPort,
  createNoopLeadAuditPort,
  createNoopLeadConversionPort,
  createNoopLeadEventPublisher,
  createNoopLeadNotificationPort,
} from "./ports/noop-ports.js";
import { createSupabaseLeadRepository } from "./repositories/supabase-lead-repositories.js";
import { createSupabaseLeadSaleCompletion } from "./repositories/supabase-sale-completion.js";
import { createSupabaseCompanyLeadQualificationSettingsStore } from "./repositories/supabase-lead-qualification-settings-store.js";
import type { CompanyLeadQualificationSettingsStore } from "./policies/company-lead-qualification-settings.js";
import { LeadCommandService } from "./services/lead-command-service.js";
import { LeadQueryService } from "./services/lead-query-service.js";

export type LeadPlatformServices = {
  commands: LeadCommandService;
  queries: LeadQueryService;
  reads: LeadReadPort;
};

export type CreateLeadPlatformServicesOptions = {
  assignees?: LeadAssigneeResolverPort;
  conversion?: LeadConversionPort;
  events?: LeadEventPublisherPort;
  notifications?: LeadNotificationPort;
  audit?: LeadAuditPort;
  /** Enables "Convert → Customer + Opportunity"; omitted = customer-only conversion. */
  opportunityConversion?: LeadOpportunityConversionPort | null;
  /** Optional Lead → Opportunity stage synchronization after changeLeadStage. */
  opportunityStageSync?: import("./ports/lead-platform-ports.js").LeadOpportunityStageSyncPort | null;
  cache?: LeadQueryCachePort;
  /** When false, skip Assignment Governance (tests only). Default: enabled. */
  assignmentGovernance?: boolean | null;
  /** When false, skip assignment audit (tests only). Default: enabled. */
  assignmentAudit?: boolean | AssignmentAuditPort | null;
  /**
   * Company qualification settings store (P1d).
   * - omit / undefined → Supabase-backed store (lead_qualification_settings)
   * - null → disabled (pure P1b defaults at qualify time)
   * - InMemory / custom → tests or alternate wiring
   */
  qualificationSettingsStore?: CompanyLeadQualificationSettingsStore | null;
};

export function createLeadPlatformServices(
  client: SupabaseClient,
  options: CreateLeadPlatformServicesOptions = {},
): LeadPlatformServices {
  const leads = createSupabaseLeadRepository(client);
  const assignees = options.assignees ?? createNoopLeadAssigneeResolverPort();
  const conversion = options.conversion ?? createNoopLeadConversionPort();
  const events = options.events ?? createNoopLeadEventPublisher();
  const notifications = options.notifications ?? createNoopLeadNotificationPort();
  const audit = options.audit ?? createNoopLeadAuditPort();
  const cache = options.cache ?? new InMemoryLeadQueryCache();
  const assignmentGovernance =
    options.assignmentGovernance === false
      ? null
      : createAssignmentGovernancePort(
          new AssignmentGovernanceService({
            port: createSupabaseAssignmentGovernanceDataPort(client),
          }),
        );

  const assignmentAudit: AssignmentAuditPort | null =
    options.assignmentAudit === false
      ? null
      : typeof options.assignmentAudit === "object" && options.assignmentAudit
        ? options.assignmentAudit
        : options?.assignmentAudit === null
          ? createNoopAssignmentAuditPort()
          : createAssignmentAuditPort(
              new AssignmentAuditService({
                port: createSupabaseAssignmentAuditDataPort(client),
              }),
            );

  const qualificationSettingsStore =
    options.qualificationSettingsStore !== undefined
      ? options.qualificationSettingsStore
      : createSupabaseCompanyLeadQualificationSettingsStore(client);

  const commands = new LeadCommandService({
    leads,
    assignees,
    conversion,
    events,
    notifications,
    audit,
    assignmentGovernance,
    assignmentAudit,
    opportunityConversion: options.opportunityConversion ?? null,
    opportunityStageSync: options.opportunityStageSync ?? null,
    qualificationSettingsStore,
    saleCompletion: createSupabaseLeadSaleCompletion(client),
  });
  const queries = new LeadQueryService({ leads, cache });
  const reads = createLeadReadPort(queries);

  return { commands, queries, reads };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./validators/lead-merge-identity.js";
export {
  assertStageTransition,
  isStageTransitionAllowed,
  selectAssignmentCandidate,
  stageTransitionBlockReason,
  type StageAuditSource,
  type StageTransitionOptions,
} from "./validators/stage-transition-validator.js";
export {
  extractSalesEvidenceFromConversation,
  salesEvidenceAuditSnapshot,
} from "./policies/conversation-sales-evidence.js";
export {
  conversationIsPublicWebWidget,
  PUBLIC_WEB_WIDGET_PROVIDER,
  qualifyOpenLeadFromCustomerTurn,
  shouldApplyAutomaticSalesQualification,
} from "./policies/automatic-sales-qualification.js";
export { createSupabaseLeadSaleCompletion } from "./repositories/supabase-sale-completion.js";
export { preserveTrustedConversationCustomer } from "./services/preserve-conversation-customer.js";
export {
  assertLeadActor,
  assertLeadCompanyAccess,
  assertLeadPermission,
} from "./validators/lead-guards.js";
export * from "./types/index.js";
export * from "./events/index.js";
export * from "./ports/index.js";
export * from "./ports/lead-read-port.js";
export * from "./cache/lead-query-cache-port.js";
export { InMemoryLeadQueryCache } from "./cache/in-memory-lead-query-cache.js";
export { createLeadReadPort } from "./adapters/lead-query-read-port.js";
export {
  LeadCommandService,
  type LeadConversionMode,
  type LeadConversionResult,
  type QualifyLeadInput,
  type QualifyLeadResult,
} from "./services/lead-command-service.js";
export { LeadQueryService } from "./services/lead-query-service.js";
export * from "./policies/qualify-lead-policy-integration.js";
export {
  createNoopLeadAssigneeResolverPort,
  createNoopLeadAuditPort,
  createNoopLeadConversionPort,
  createNoopLeadEventPublisher,
  createNoopLeadNotificationPort,
  createSupabaseLeadAuditPort,
} from "./ports/noop-ports.js";
export * from "./smart-capture/capture-types.js";
export * from "./smart-capture/capture-identity.js";
export {
  createSupabaseLeadSmartCapture,
  type LeadSmartCapture,
  type LeadSmartCaptureServices,
} from "./smart-capture/supabase-smart-capture.js";
export * from "./intelligence/index.js";
export * from "./policies/lead-qualification-policy.js";
export * from "./policies/company-lead-qualification-settings.js";
export {
  createSupabaseCompanyLeadQualificationSettingsStore,
  mapLeadQualificationSettingsRow,
  leadQualificationSettingsToRow,
} from "./repositories/supabase-lead-qualification-settings-store.js";
