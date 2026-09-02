import type { TFunction } from "i18next";
import type { EnrichedAuditLog } from "@/lib/types";
import {
  getEntityLabelKey,
  readMetadataRecord,
  readMetadataString,
  readMetadataStringArray,
  resolveAuditOperation,
} from "@/lib/audit-log/mapping";
import {
  formatMetadataValue,
  translateRoleName,
  type LookupContext,
} from "@/lib/audit-log/presenter";
import { summarizeAiAssistantChanges } from "@/lib/audit-log/ai-assistant-changes";

type ImportantChange = {
  key: string;
  hintKey: string;
  from: string;
  to: string;
};

const IMPORTANT_FIELD_ORDER = [
  "role_id",
  "is_active",
  "status",
  "email",
  "full_name",
  "name",
  "company_id",
  "amount",
  "service",
] as const;

const FIELD_HINT_KEYS: Record<string, string> = {
  role_id: "role",
  is_active: "status",
  status: "status",
  email: "email",
  full_name: "name",
  name: "name",
  company_id: "company",
  amount: "amount",
  service: "service",
};

const PAIR_HINT_KEYS: Record<string, string> = {
  "role|status": "roleAndStatus",
  "email|role": "emailAndRole",
  "email|status": "emailAndStatus",
  "name|status": "nameAndStatus",
  "company|role": "companyAndRole",
};

function getActorName(log: EnrichedAuditLog, t: TFunction<"common">): string {
  return (
    log.profile?.full_name?.trim() ||
    log.profile?.email?.trim() ||
    (log.user_id ? t("auditLogs.fallbacks.deletedUser") : t("auditLogs.fallbacks.systemUser"))
  );
}

function getTargetName(
  log: EnrichedAuditLog,
  context: LookupContext,
  t: TFunction<"common">,
): string {
  if (log.entityDisplayName?.trim()) {
    return log.entityDisplayName.trim();
  }

  const metadata = log.metadata ?? {};
  const newValues = readMetadataRecord(metadata, "new");
  const oldValues = readMetadataRecord(metadata, "old");

  const fromMeta =
    readMetadataString(metadata, "name") ??
    readMetadataString(metadata, "full_name") ??
    readMetadataString(metadata, "email") ??
    readMetadataString(metadata, "service") ??
    readMetadataString(newValues ?? {}, "name") ??
    readMetadataString(oldValues ?? {}, "name");

  if (fromMeta) return fromMeta;

  if (log.entity === "user_roles") {
    const userId = readMetadataString(metadata, "user_id");
    if (userId && context.userNames.get(userId)) {
      return context.userNames.get(userId)!;
    }
  }

  if (log.entity === "bookings" || log.entity === "invoices") {
    const customerHint =
      readMetadataString(metadata, "customer_name") ??
      readMetadataString(newValues ?? {}, "customer_name");
    if (customerHint) return customerHint;
  }

  // Known entity types: use localized entity label rather than "—" / raw keys.
  if (log.entity) {
    return t(getEntityLabelKey(log.entity));
  }

  return t("auditLogs.fallbacks.unavailable");
}

function collectFieldChanges(
  log: EnrichedAuditLog,
  context: LookupContext,
  t: TFunction<"common">,
): ImportantChange[] {
  const metadata = log.metadata ?? {};
  const oldValues = readMetadataRecord(metadata, "old");
  const newValues = readMetadataRecord(metadata, "new");
  const changes: ImportantChange[] = [];

  if (oldValues && newValues) {
    for (const key of IMPORTANT_FIELD_ORDER) {
      if (!(key in oldValues) && !(key in newValues)) continue;

      const from = formatMetadataValue(key, oldValues[key], context, t);
      const to = formatMetadataValue(key, newValues[key], context, t);
      if (from === to) continue;

      const hintKey = FIELD_HINT_KEYS[key];
      if (!hintKey) continue;

      changes.push({ key, hintKey, from, to });
    }
  }

  if (log.entity === "user_roles") {
    const roleId = readMetadataString(metadata, "role_id");
    const roleName = roleId
      ? formatMetadataValue("role_id", roleId, context, t)
      : t("auditLogs.fallbacks.unavailable");
    const operation = resolveAuditOperation(log);

    if (operation === "DELETE") {
      changes.unshift({
        key: "role_id",
        hintKey: "role",
        from: roleName,
        to: t("auditLogs.fallbacks.none"),
      });
    } else {
      changes.unshift({
        key: "role_id",
        hintKey: "role",
        from: t("auditLogs.fallbacks.none"),
        to: roleName,
      });
    }
  }

  return changes;
}

function appendChangeHints(
  sentence: string,
  changes: ImportantChange[],
  excludeKeys: string[],
  t: TFunction<"common">,
): string {
  const remaining = changes.filter((change) => !excludeKeys.includes(change.key));
  if (remaining.length === 0) return sentence;

  const hints = remaining.slice(0, 2).map((change) => change.hintKey);
  const hintText = formatHintText(hints, t);
  if (!hintText) return sentence;

  return `${sentence} ${hintText}`;
}

function formatHintText(hints: string[], t: TFunction<"common">): string {
  if (hints.length === 0) return "";

  if (hints.length === 1) {
    return t(`auditLogs.activity.hints.${hints[0]}`);
  }

  const pairKey = `${hints[0]}|${hints[1]}`;
  const paired = PAIR_HINT_KEYS[pairKey];
  if (paired) {
    return t(`auditLogs.activity.hints.${paired}`);
  }

  return t("auditLogs.activity.hints.multiple", {
    first: t(`auditLogs.activity.hintLabels.${hints[0]}`),
    second: t(`auditLogs.activity.hintLabels.${hints[1]}`),
  });
}

function findChange(changes: ImportantChange[], key: string): ImportantChange | undefined {
  return changes.find((change) => change.key === key);
}

function formatInvoiceLabel(log: EnrichedAuditLog, target: string): string {
  const metadata = log.metadata ?? {};
  const newValues = readMetadataRecord(metadata, "new");
  const code =
    readMetadataString(metadata, "code") ??
    readMetadataString(newValues ?? {}, "code") ??
    readMetadataString(metadata, "name");

  if (code && !code.includes("@")) {
    return code;
  }

  return target;
}

function formatStatusValue(value: string, t: TFunction<"common">): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "true") {
    return t("status.active");
  }
  if (normalized === "no" || normalized === "false") {
    return t("status.suspended");
  }
  const translated = t(`status.${normalized}`, { defaultValue: "" });
  if (translated) return translated;
  return value;
}

export function buildActivitySummary(
  log: EnrichedAuditLog,
  context: LookupContext,
  t: TFunction<"common">,
): string {
  const actor = getActorName(log, t);
  const operation = resolveAuditOperation(log);
  const target = getTargetName(log, context, t);
  const changes = collectFieldChanges(log, context, t);

  if (operation === "LOGIN") {
    return t("auditLogs.activity.login", { actor });
  }
  if (operation === "LOGOUT") {
    return t("auditLogs.activity.logout", { actor });
  }
  if (operation === "PASSWORD_RESET") {
    return t("auditLogs.activity.passwordReset", { actor });
  }
  if (operation === "INVITE_USER") {
    return t("auditLogs.activity.inviteUser", { actor, target });
  }

  if (log.entity === "profiles") {
    if (operation === "CREATE") {
      return t("auditLogs.activity.userCreated", { actor, target });
    }
    if (operation === "DELETE") {
      return t("auditLogs.activity.userDeleted", { actor, target });
    }

    const roleChange = findChange(changes, "role_id");
    if (roleChange) {
      const fromRole =
        roleChange.from === t("auditLogs.fallbacks.none")
          ? t("auditLogs.fallbacks.noRole")
          : translateRoleName(roleChange.from, t);
      const toRole =
        roleChange.to === t("auditLogs.fallbacks.none")
          ? t("auditLogs.fallbacks.noRole")
          : translateRoleName(roleChange.to, t);
      return t("auditLogs.activity.userRoleChanged", {
        actor,
        target,
        from: fromRole,
        to: toRole,
      });
    }

    return appendChangeHints(
      t("auditLogs.activity.userUpdated", { actor, target }),
      changes,
      [],
      t,
    );
  }

  if (log.entity === "companies") {
    if (operation === "CREATE") return t("auditLogs.activity.companyCreated", { actor, target });
    if (operation === "DELETE") return t("auditLogs.activity.companyDeleted", { actor, target });
    return appendChangeHints(t("auditLogs.activity.companyUpdated", { actor, target }), changes, [], t);
  }

  if (log.entity === "customers") {
    if (operation === "CREATE") return t("auditLogs.activity.customerCreated", { actor, target });
    if (operation === "DELETE") return t("auditLogs.activity.customerDeleted", { actor, target });
    return appendChangeHints(t("auditLogs.activity.customerUpdated", { actor, target }), changes, [], t);
  }

  if (log.entity === "roles") {
    if (operation === "CREATE") return t("auditLogs.activity.roleCreated", { actor, target });
    if (operation === "DELETE") return t("auditLogs.activity.roleDeleted", { actor, target });
    return appendChangeHints(t("auditLogs.activity.roleUpdated", { actor, target }), changes, [], t);
  }

  if (log.entity === "invoices") {
    const invoiceLabel = formatInvoiceLabel(log, target);
    if (operation === "CREATE") {
      return t("auditLogs.activity.invoiceCreated", { actor, target: invoiceLabel });
    }
    if (operation === "DELETE") {
      return t("auditLogs.activity.invoiceDeleted", { actor, target: invoiceLabel });
    }

    const statusChange = findChange(changes, "status");
    if (statusChange) {
      return t("auditLogs.activity.invoiceStatusChanged", {
        actor,
        target: invoiceLabel,
        status: formatStatusValue(statusChange.to, t),
      });
    }

    return appendChangeHints(
      t("auditLogs.activity.invoiceUpdated", { actor, target: invoiceLabel }),
      changes,
      [],
      t,
    );
  }

  if (log.entity === "bookings") {
    if (operation === "CREATE") {
      return t("auditLogs.activity.bookingCreated", { actor, target });
    }
    if (operation === "DELETE") {
      return t("auditLogs.activity.bookingCancelled", { actor, target });
    }

    const statusChange = findChange(changes, "status");
    if (statusChange) {
      return t("auditLogs.activity.bookingStatusChanged", {
        actor,
        target,
        status: formatStatusValue(statusChange.to, t),
      });
    }

    return appendChangeHints(t("auditLogs.activity.bookingUpdated", { actor, target }), changes, [], t);
  }

  if (log.entity === "user_roles") {
    const roleChange = findChange(changes, "role_id");
    if (operation === "DELETE") {
      return t("auditLogs.activity.userRoleRemoved", {
        actor,
        target,
        role: roleChange ? translateRoleName(roleChange.from, t) : t("auditLogs.fallbacks.noRole"),
      });
    }
    return t("auditLogs.activity.userRoleAssigned", {
      actor,
      target,
      role: roleChange ? translateRoleName(roleChange.to, t) : t("auditLogs.fallbacks.noRole"),
    });
  }

  if (log.entity === "role_permissions") {
    const roleId = readMetadataString(log.metadata ?? {}, "role_id");
    const roleName = roleId
      ? translateRoleName(context.roleNames.get(roleId) ?? null, t)
      : target;
    return t("auditLogs.activity.permissionsUpdated", { actor, target: roleName });
  }

  if (log.entity === "ai_assistant_settings") {
    if (operation === "CREATE") {
      return t("auditLogs.activity.aiAssistantCreated", { actor, target });
    }

    const changeSummaries = summarizeAiAssistantChanges(log.metadata ?? {}, t);
    if (changeSummaries.length > 0) {
      return t("auditLogs.activity.aiAssistantUpdatedDetailed", {
        actor,
        target,
        changes: changeSummaries.join("; "),
      });
    }

    return t("auditLogs.activity.aiAssistantUpdated", { actor, target });
  }

  if (log.entity === "company_channels") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const displayName = readMetadataString(log.metadata ?? {}, "display_name") ?? target;

    if (primaryEvent === "channel_connected") {
      return t("auditLogs.activity.channelConnected", { actor, target: displayName });
    }
    if (primaryEvent === "channel_enabled") {
      return t("auditLogs.activity.channelEnabled", { actor, target: displayName });
    }
    if (primaryEvent === "channel_disabled") {
      return t("auditLogs.activity.channelDisabled", { actor, target: displayName });
    }
    if (primaryEvent === "configuration_updated") {
      return t("auditLogs.activity.channelConfigurationUpdated", { actor, target: displayName });
    }
    if (primaryEvent === "health_status_changed") {
      return t("auditLogs.activity.channelHealthStatusChanged", { actor, target: displayName });
    }
    if (primaryEvent === "default_channel_changed") {
      return t("auditLogs.activity.defaultChannelChanged", { actor, target: displayName });
    }
  }

  if (
    log.entity === "conversations" ||
    log.entity === "conversation_participants" ||
    log.entity === "conversation_messages"
  ) {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const channelType = readMetadataString(log.metadata ?? {}, "channel_type");
    const state = readMetadataString(readMetadataRecord(log.metadata ?? {}, "new") ?? {}, "state") ??
      readMetadataString(log.metadata ?? {}, "state");

    if (primaryEvent === "conversation_created") {
      return t("auditLogs.activity.conversationCreated", { actor, channel: channelType ?? target });
    }
    if (primaryEvent === "conversation_started") {
      return t("auditLogs.activity.conversationStarted", { actor, target });
    }
    if (primaryEvent === "greeting_completed") {
      return t("auditLogs.activity.greetingCompleted", { actor, target });
    }
    if (primaryEvent === "waiting_for_customer") {
      return t("auditLogs.activity.waitingForCustomer", { actor, target });
    }
    if (primaryEvent === "waiting_for_tool") {
      return t("auditLogs.activity.waitingForTool", { actor, target });
    }
    if (primaryEvent === "conversation_completed") {
      return t("auditLogs.activity.conversationCompleted", { actor, target });
    }
    if (primaryEvent === "conversation_cancelled") {
      return t("auditLogs.activity.conversationCancelled", { actor, target });
    }
    if (primaryEvent === "transferred_to_human") {
      return t("auditLogs.activity.conversationTransferredToHuman", { actor, target });
    }
    if (primaryEvent === "returned_to_ai") {
      return t("auditLogs.activity.conversationReturnedToAi", { actor, target });
    }
    if (primaryEvent === "conversation_closed") {
      return t("auditLogs.activity.conversationClosed", { actor, target });
    }
    if (primaryEvent === "participant_added") {
      return t("auditLogs.activity.participantAdded", { actor, target });
    }
    if (primaryEvent === "participant_removed") {
      return t("auditLogs.activity.participantRemoved", { actor, target });
    }
    if (primaryEvent === "message_added") {
      return t("auditLogs.activity.messageAdded", { actor, target });
    }
    if (primaryEvent === "assignment_changed") {
      return t("auditLogs.activity.conversationAssignmentChanged", { actor, target });
    }
    if (primaryEvent === "state_changed") {
      return t("auditLogs.activity.conversationStateChanged", {
        actor,
        target,
        state: state ?? t("auditLogs.fallbacks.unknown"),
      });
    }
    if (primaryEvent === "priority_changed") {
      return t("auditLogs.activity.conversationPriorityChanged", { actor, target });
    }
    if (primaryEvent === "conversation_locked") {
      return t("auditLogs.activity.conversationLocked", { actor, target });
    }
    if (primaryEvent === "unread_reset") {
      return t("auditLogs.activity.conversationUnreadReset", { actor, target });
    }
    if (primaryEvent === "metadata_updated") {
      return t("auditLogs.activity.conversationMetadataUpdated", { actor, target });
    }
  }

  if (log.entity === "tool_definitions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const displayName = readMetadataString(log.metadata ?? {}, "display_name") ?? target;

    if (primaryEvent === "tool_enabled") {
      return t("auditLogs.activity.toolEnabled", { actor, target: displayName });
    }
    if (primaryEvent === "tool_disabled") {
      return t("auditLogs.activity.toolDisabled", { actor, target: displayName });
    }
  }

  if (log.entity === "tool_executions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const toolKey = readMetadataString(log.metadata ?? {}, "tool_key") ?? target;

    if (primaryEvent === "tool_executed") {
      return t("auditLogs.activity.toolExecuted", { actor, target: toolKey });
    }
    if (primaryEvent === "tool_failed") {
      return t("auditLogs.activity.toolFailed", { actor, target: toolKey });
    }
    if (primaryEvent === "tool_timeout") {
      return t("auditLogs.activity.toolTimeout", { actor, target: toolKey });
    }
  }

  if (log.entity === "intent_definitions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const displayName = readMetadataString(log.metadata ?? {}, "display_name") ?? target;

    if (primaryEvent === "intent_enabled") {
      return t("auditLogs.activity.intentEnabled", { actor, target: displayName });
    }
    if (primaryEvent === "intent_disabled") {
      return t("auditLogs.activity.intentDisabled", { actor, target: displayName });
    }
  }

  if (log.entity === "intent_matches") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events.find((event) => event !== "classifier_selected") ?? events[0];
    const intentKey = readMetadataString(log.metadata ?? {}, "intent_key") ?? target;
    const classifierKey = readMetadataString(log.metadata ?? {}, "classifier_key");

    if (primaryEvent === "intent_matched") {
      return t("auditLogs.activity.intentMatched", { actor, target: intentKey, classifier: classifierKey ?? t("auditLogs.fallbacks.unknown") });
    }
    if (primaryEvent === "intent_rejected") {
      return t("auditLogs.activity.intentRejected", { actor, target: intentKey });
    }
    if (primaryEvent === "intent_fallback") {
      return t("auditLogs.activity.intentFallback", { actor, target: intentKey });
    }
    if (primaryEvent === "intent_escalated") {
      return t("auditLogs.activity.intentEscalated", { actor, target: intentKey });
    }
    if (primaryEvent === "classifier_selected") {
      return t("auditLogs.activity.classifierSelected", { actor, target: classifierKey ?? intentKey });
    }
  }

  if (log.entity === "ai_provider_connections") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const displayName = readMetadataString(log.metadata ?? {}, "display_name") ?? target;
    const providerKey = readMetadataString(log.metadata ?? {}, "provider_key");

    if (primaryEvent === "provider_connected") {
      return t("auditLogs.activity.providerConnected", { actor, target: displayName, provider: providerKey ?? t("auditLogs.fallbacks.unknown") });
    }
    if (primaryEvent === "provider_enabled") {
      return t("auditLogs.activity.providerEnabled", { actor, target: displayName });
    }
    if (primaryEvent === "provider_disabled") {
      return t("auditLogs.activity.providerDisabled", { actor, target: displayName });
    }
    if (primaryEvent === "provider_updated") {
      return t("auditLogs.activity.providerUpdated", { actor, target: displayName });
    }
    if (primaryEvent === "provider_health_changed") {
      return t("auditLogs.activity.providerHealthChanged", { actor, target: displayName });
    }
  }

  if (log.entity === "prompt_templates" || log.entity === "prompt_template_versions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const displayName = readMetadataString(log.metadata ?? {}, "display_name") ?? target;
    const templateKey = readMetadataString(log.metadata ?? {}, "key") ?? target;

    if (primaryEvent === "template_activated") {
      return t("auditLogs.activity.templateActivated", { actor, target: displayName || templateKey });
    }
    if (primaryEvent === "template_disabled") {
      return t("auditLogs.activity.templateDisabled", { actor, target: displayName || templateKey });
    }
    if (primaryEvent === "template_updated") {
      return t("auditLogs.activity.templateUpdated", { actor, target: displayName || templateKey });
    }
  }

  if (log.entity === "prompt_builds") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const templateKey = readMetadataString(log.metadata ?? {}, "template_key") ?? target;

    if (primaryEvent === "prompt_built") {
      return t("auditLogs.activity.promptBuilt", { actor, target: templateKey });
    }
  }

  if (log.entity === "knowledge_sources") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const displayName = readMetadataString(log.metadata ?? {}, "display_name") ?? target;

    if (primaryEvent === "knowledge_source_created" || primaryEvent === "source_created") {
      return t("auditLogs.activity.knowledgeSourceCreated", { actor, target: displayName });
    }
  }

  if (log.entity === "knowledge_document_versions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const versionNumber = readMetadataString(log.metadata ?? {}, "version_number") ?? target;

    if (primaryEvent === "version_created") {
      return t("auditLogs.activity.versionCreated", { actor, target: versionNumber });
    }
    if (primaryEvent === "document_published") {
      return t("auditLogs.activity.documentPublished", { actor, target: versionNumber });
    }
  }

  if (log.entity === "knowledge_documents") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const title = readMetadataString(log.metadata ?? {}, "title") ?? target;

    if (primaryEvent === "document_imported") {
      return t("auditLogs.activity.documentImported", { actor, target: title });
    }
    if (primaryEvent === "document_updated") {
      return t("auditLogs.activity.documentUpdated", { actor, target: title });
    }
    if (primaryEvent === "document_archived") {
      return t("auditLogs.activity.documentArchived", { actor, target: title });
    }
    if (primaryEvent === "document_published") {
      return t("auditLogs.activity.documentPublished", { actor, target: title });
    }
  }

  if (log.entity === "knowledge_chunks") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const chunkOrder = readMetadataString(log.metadata ?? {}, "chunk_order");

    if (primaryEvent === "chunk_generated") {
      return t("auditLogs.activity.chunkGenerated", { actor, target: chunkOrder ?? target });
    }
  }

  if (log.entity === "embedding_jobs") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const model = readMetadataString(log.metadata ?? {}, "model") ?? target;

    if (primaryEvent === "embedding_requested") {
      return t("auditLogs.activity.embeddingRequested", { actor, target: model });
    }
    if (primaryEvent === "embedding_regenerated") {
      return t("auditLogs.activity.embeddingRegenerated", { actor, target: model });
    }
    if (primaryEvent === "embedding_failed") {
      return t("auditLogs.activity.embeddingFailed", { actor, target: model });
    }
  }

  if (log.entity === "knowledge_embeddings") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const model = readMetadataString(log.metadata ?? {}, "model") ?? target;
    const version = readMetadataString(log.metadata ?? {}, "embedding_version");

    if (primaryEvent === "embedding_generated") {
      return t("auditLogs.activity.embeddingGenerated", { actor, target: model });
    }
    if (primaryEvent === "embedding_activated") {
      return t("auditLogs.activity.embeddingActivated", {
        actor,
        target: version ? `${model} v${version}` : model,
      });
    }
  }

  if (log.entity === "vector_store_connections") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const displayName = readMetadataString(log.metadata ?? {}, "display_name") ?? target;

    if (primaryEvent === "provider_connected") {
      return t("auditLogs.activity.providerConnected", { actor, target: displayName });
    }
    if (primaryEvent === "provider_disconnected") {
      return t("auditLogs.activity.providerDisconnected", { actor, target: displayName });
    }
  }

  if (log.entity === "vector_collections") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const name = readMetadataString(log.metadata ?? {}, "name") ?? target;

    if (primaryEvent === "vector_collection_created") {
      return t("auditLogs.activity.vectorCollectionCreated", { actor, target: name });
    }
    if (primaryEvent === "vector_collection_deleted") {
      return t("auditLogs.activity.vectorCollectionDeleted", { actor, target: name });
    }
  }

  if (log.entity === "indexed_vectors") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];

    if (primaryEvent === "vector_indexed") {
      return t("auditLogs.activity.vectorIndexed", { actor, target });
    }
    if (primaryEvent === "vector_removed") {
      return t("auditLogs.activity.vectorRemoved", { actor, target });
    }
  }

  if (log.entity === "vector_search_policies") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const policyName = readMetadataString(log.metadata ?? {}, "policy_name") ?? target;

    if (primaryEvent === "search_policy_updated") {
      return t("auditLogs.activity.searchPolicyUpdated", { actor, target: policyName });
    }
  }

  if (log.entity === "vector_query_executions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const provider = readMetadataString(log.metadata ?? {}, "provider") ?? target;
    const resultCount = readMetadataString(log.metadata ?? {}, "result_count");

    if (primaryEvent === "vector_query_started") {
      return t("auditLogs.activity.vectorQueryStarted", { actor, target: provider });
    }
    if (primaryEvent === "vector_query_completed") {
      return t("auditLogs.activity.vectorQueryCompleted", {
        actor,
        target: resultCount ? `${provider} (${resultCount} results)` : provider,
      });
    }
    if (primaryEvent === "vector_query_failed") {
      return t("auditLogs.activity.vectorQueryFailed", { actor, target: provider });
    }
    if (primaryEvent === "vector_results_ranked") {
      return t("auditLogs.activity.vectorResultsRanked", {
        actor,
        target: resultCount ?? provider,
      });
    }
  }

  if (log.entity === "retrieval_executions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const vectorQueryExecutionId =
      readMetadataString(log.metadata ?? {}, "vector_query_execution_id") ?? target;

    if (primaryEvent === "retrieval_started") {
      return t("auditLogs.activity.retrievalStarted", { actor, target: vectorQueryExecutionId });
    }
    if (primaryEvent === "retrieval_completed") {
      return t("auditLogs.activity.retrievalCompleted", { actor, target: vectorQueryExecutionId });
    }
    if (primaryEvent === "retrieval_failed") {
      return t("auditLogs.activity.retrievalFailed", { actor, target: vectorQueryExecutionId });
    }
  }

  if (log.entity === "retrieval_contexts") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const chunkCount = readMetadataString(log.metadata ?? {}, "chunk_count");

    if (primaryEvent === "retrieval_context_created") {
      return t("auditLogs.activity.retrievalContextCreated", {
        actor,
        target: chunkCount ? `${target} (${chunkCount} chunks)` : target,
      });
    }
  }

  if (log.entity === "retrieval_policies") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const policyName = readMetadataString(log.metadata ?? {}, "policy_name") ?? target;

    if (primaryEvent === "retrieval_policy_updated") {
      return t("auditLogs.activity.retrievalPolicyUpdated", { actor, target: policyName });
    }
  }

  if (log.entity === "runtime_executions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const conversationId = readMetadataString(log.metadata ?? {}, "conversation_id") ?? target;

    if (primaryEvent === "runtime_started") {
      return t("auditLogs.activity.runtimeStarted", { actor, target: conversationId });
    }
    if (primaryEvent === "runtime_completed") {
      return t("auditLogs.activity.runtimeCompleted", { actor, target: conversationId });
    }
    if (primaryEvent === "runtime_failed") {
      return t("auditLogs.activity.runtimeFailed", { actor, target: conversationId });
    }
  }

  if (log.entity === "runtime_execution_steps") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const stage = readMetadataString(log.metadata ?? {}, "stage") ?? target;

    if (primaryEvent === "runtime_step_completed") {
      return t("auditLogs.activity.runtimeStepCompleted", { actor, target: stage });
    }
  }

  if (log.entity === "execution_policies") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const policyName = readMetadataString(log.metadata ?? {}, "policy_name") ?? target;

    if (primaryEvent === "runtime_policy_updated") {
      return t("auditLogs.activity.runtimePolicyUpdated", { actor, target: policyName });
    }
  }

  if (log.entity === "ai_traces") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const traceId = readMetadataString(log.metadata ?? {}, "trace_id") ?? target;

    if (primaryEvent === "trace_started") {
      return t("auditLogs.activity.traceStarted", { actor, target: traceId });
    }
    if (primaryEvent === "trace_completed") {
      return t("auditLogs.activity.traceCompleted", { actor, target: traceId });
    }
    if (primaryEvent === "trace_failed") {
      return t("auditLogs.activity.traceFailed", { actor, target: traceId });
    }
    if (primaryEvent === "policy_violated") {
      return t("auditLogs.activity.policyViolated", { actor, target: traceId });
    }
  }

  if (log.entity === "ai_token_cost_records") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const providerKey = readMetadataString(log.metadata ?? {}, "provider_key") ?? target;
    const billingPeriod = readMetadataString(log.metadata ?? {}, "billing_period");

    if (primaryEvent === "cost_recorded") {
      return t("auditLogs.activity.costRecorded", {
        actor,
        target: providerKey,
        period: billingPeriod ?? t("auditLogs.fallbacks.unknown"),
      });
    }
  }

  if (log.entity === "ai_executions") {
    const events = readMetadataStringArray(log.metadata ?? {}, "events");
    const primaryEvent = events[0];
    const providerKey = readMetadataString(log.metadata ?? {}, "provider_key") ?? target;
    const model = readMetadataString(log.metadata ?? {}, "model");

    if (primaryEvent === "ai_execution_started") {
      return t("auditLogs.activity.aiExecutionStarted", { actor, target: providerKey, model: model ?? t("auditLogs.fallbacks.unknown") });
    }
    if (primaryEvent === "ai_execution_completed") {
      return t("auditLogs.activity.aiExecutionCompleted", { actor, target: providerKey, model: model ?? t("auditLogs.fallbacks.unknown") });
    }
    if (primaryEvent === "ai_execution_failed") {
      return t("auditLogs.activity.aiExecutionFailed", { actor, target: providerKey, model: model ?? t("auditLogs.fallbacks.unknown") });
    }
    if (primaryEvent === "provider_timeout") {
      return t("auditLogs.activity.providerTimeout", { actor, target: providerKey, model: model ?? t("auditLogs.fallbacks.unknown") });
    }
    if (primaryEvent === "provider_retry") {
      return t("auditLogs.activity.providerRetry", { actor, target: providerKey, model: model ?? t("auditLogs.fallbacks.unknown") });
    }
    if (primaryEvent === "fallback_provider_used") {
      return t("auditLogs.activity.fallbackProviderUsed", { actor, target: providerKey, model: model ?? t("auditLogs.fallbacks.unknown") });
    }
  }

  if (log.entity === "business_appointment_exceptions") {
    const scope = readMetadataString(log.metadata ?? {}, "scope");
    const exceptionDate = readMetadataString(log.metadata ?? {}, "exception_date");
    const status = readMetadataString(log.metadata ?? {}, "status");
    const entityLabel = t(getEntityLabelKey(log.entity));

    // Pre-327 rows may have empty metadata — prefer entity-label summaries over raw i18n keys.
    if (operation === "CREATE") {
      if (scope && exceptionDate) {
        return t("auditLogs.activity.businessExceptionCreated", {
          actor,
          scope,
          date: exceptionDate,
        });
      }
      return t("auditLogs.activity.recordCreated", { actor, target: entityLabel });
    }
    if (operation === "DELETE") {
      if (exceptionDate) {
        return t("auditLogs.activity.businessExceptionDeleted", { actor, date: exceptionDate });
      }
      return t("auditLogs.activity.recordDeleted", { actor, target: entityLabel });
    }
    if (exceptionDate && status) {
      return t("auditLogs.activity.businessExceptionUpdated", {
        actor,
        date: exceptionDate,
        status,
      });
    }
    return t("auditLogs.activity.recordUpdated", { actor, target: entityLabel });
  }

  if (log.entity === "business_appointment_exception_items") {
    const notifyStatus = readMetadataString(log.metadata ?? {}, "notification_status");
    const cancelStatus = readMetadataString(log.metadata ?? {}, "cancellation_status");
    const entityLabel = t(getEntityLabelKey(log.entity));
    if (cancelStatus && notifyStatus) {
      if (operation === "CREATE") {
        return t("auditLogs.activity.businessExceptionItemCreated", {
          actor,
          cancelStatus,
          notifyStatus,
        });
      }
      return t("auditLogs.activity.businessExceptionItemUpdated", {
        actor,
        cancelStatus,
        notifyStatus,
      });
    }
    if (operation === "CREATE") {
      return t("auditLogs.activity.recordCreated", { actor, target: entityLabel });
    }
    if (operation === "DELETE") {
      return t("auditLogs.activity.recordDeleted", { actor, target: entityLabel });
    }
    return t("auditLogs.activity.recordUpdated", { actor, target: entityLabel });
  }

  if (log.entity === "scheduling_bookings") {
    const source = readMetadataString(log.metadata ?? {}, "source");
    const newStatus =
      readMetadataString(log.metadata ?? {}, "new_status") ??
      readMetadataString(readMetadataRecord(log.metadata ?? {}, "new") ?? {}, "status");
    if (source === "business_appointment_exception" && newStatus === "cancelled") {
      return t("auditLogs.activity.schedulingBookingCancelledByException", { actor, target });
    }
    if (operation === "CREATE") {
      return t("auditLogs.activity.bookingCreated", { actor, target });
    }
    if (newStatus === "cancelled" || operation === "DELETE") {
      return t("auditLogs.activity.bookingCancelled", { actor, target });
    }
    if (newStatus) {
      return t("auditLogs.activity.bookingStatusChanged", {
        actor,
        target,
        status: formatStatusValue(newStatus, t),
      });
    }
    return appendChangeHints(t("auditLogs.activity.bookingUpdated", { actor, target }), changes, [], t);
  }

  if (operation === "CREATE") {
    return t("auditLogs.activity.recordCreated", { actor, target });
  }
  if (operation === "DELETE") {
    return t("auditLogs.activity.recordDeleted", { actor, target });
  }

  return appendChangeHints(t("auditLogs.activity.recordUpdated", { actor, target }), changes, [], t);
}
