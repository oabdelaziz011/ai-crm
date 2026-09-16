import { ValidationError } from "../errors.js";
import {
  evaluateSwitchCase,
  validateRuleSet,
  interpolateTemplateString,
  type CompiledRuleSet,
  type SwitchNodeConfig,
} from "../logic/index.js";
import {
  extractInteractiveSelection,
  INTERACTIVE_SELECTION_INPUT_KEY,
  mergeConversationVariables,
} from "../runtime/conversation-variables.js";
import {
  ensureConversationLanguage,
  readConversationLanguage,
} from "../runtime/conversation-language.js";
import {
  isGreetingOnlyUtterance,
  promptAfterGreetingOnlyInput,
} from "../runtime/greeting-utterance.js";
import { localizeMessageText, localizeNodeConfigForLanguage } from "../runtime/localize-node-config.js";
import {
  ANOTHER_DOCTOR_SELECTION_ID,
  EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE,
  END_CHAT_SELECTION_ID,
  emptyDoctorCatalogGoodbye,
  emptyDoctorCatalogMessage,
  emptyDoctorCatalogRecoveryOutbound,
  emptyDoctorLookupRetryPatch,
  findPrecedingServicesListNode,
  isDoctorCatalogLookup,
  resolveEmptyDoctorLookupRecoveryId,
} from "../runtime/empty-doctor-lookup-recovery.js";
import {
  buildInteractiveMenuOutbound,
  findPrimaryMenuNode,
} from "../runtime/main-menu.js";
import { withSelectionDisplayVariables } from "../runtime/selection-display-fields.js";
import {
  appendOutboundQueueEntry,
  clearLatestOutboundSlot,
  readOutboundQueue,
  type OutboundQueueEntry,
} from "../runtime/outbound-queue.js";
import type { BookingServicePort } from "../ports/booking-service-port.js";
import type { CustomerServicePort } from "../ports/customer-service-port.js";
import type { ConversationCustomerLinkPort } from "../ports/conversation-customer-link-port.js";
import type { TicketServicePort } from "../ports/ticket-service-port.js";
import type { HandoffServicePort } from "../ports/handoff-service-port.js";
import { executeCreateBookingAction } from "./crm/create-booking-action.js";
import { executeFindBookingAction } from "./crm/find-booking-action.js";
import { executeRescheduleBookingAction } from "./crm/reschedule-booking-action.js";
import { executeCancelBookingAction, executeUpdateBookingAction } from "./crm/update-booking-action.js";
import { executeCreateCustomerAction, executeUpdateCustomerAction } from "./crm/create-customer-action.js";
import { executeFindCustomerAction } from "./crm/find-customer-action.js";
import { executeAssignTicketAction, executeCreateTicketAction } from "./crm/create-ticket-action.js";
import { executeFindTicketAction } from "./crm/find-ticket-action.js";
import {
  executeHandoffToHumanAction,
  validateHandoffToHumanConfig,
} from "./handoff/handoff-to-human-action.js";
import type { AutomationNodeHandler, ExecutionContext, NodeExecutionResult } from "./execution-context.js";
import { mergeVariables } from "./execution-context.js";
import { traceIfNodeEntered, traceLegacyIfNodeEvaluation, executeIfRuleSetWithTrace } from "../debug/if-node-trace-debug.js";
import { traceListSelectionApplied } from "../debug/interactive-if-trace-debug.js";
import {
  logAfterSendListMessage,
  logBeforeExecuteListNode,
  registerActiveListVisit,
} from "../debug/list-node-lifecycle-debug.js";
import type { BusinessCalendarPort } from "../ports/business-calendar-port.js";
import type { LookupOptionsPort } from "../ports/lookup-options-port.js";
import {
  normalizeSelectedDate,
  readDatePickerRuntimeConfig,
  validateSelectedDate,
} from "../runtime/date-picker-validation.js";
import { isListLookupMode, resolveListNodeSections, readListLookupRuntimeConfig, AVAILABLE_DATES_LOOKUP, resolveAvailableDatesEmptyMessageFromConfig } from "../runtime/list-lookup-resolver.js";
import { resolveInteractiveListLimits } from "../runtime/channel-interactive-list-limits.js";
import {
  applyInteractiveListPaginationToSections,
  buildPaginatedInteractiveListSections,
  clearInteractiveListPaginationState,
  INTERACTIVE_LIST_PAGINATION_VARIABLE,
  isInteractiveListNextPageReply,
  readInteractiveListPaginationState,
  type InteractiveListSection,
} from "../runtime/interactive-list-pagination.js";
import { resolveInteractiveListSelection } from "../runtime/interactive-list-selection.js";
import { readInteractiveListOutputVariable } from "../runtime/interactive-list-variable.js";
import { validateNodeVariableContract } from "./workflow-variable-contracts.js";

export type AutomationActionDeps = {
  bookingService?: BookingServicePort;
  customerService?: CustomerServicePort;
  conversationCustomerLink?: ConversationCustomerLinkPort;
  lookupOptions?: LookupOptionsPort;
  businessCalendar?: BusinessCalendarPort;
  ticketService?: TicketServicePort;
  handoffService?: HandoffServicePort;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRuleSet(config: Record<string, unknown>): CompiledRuleSet | null {
  const ruleSet = config.ruleSet;
  if (!ruleSet || typeof ruleSet !== "object") return null;
  const root = (ruleSet as CompiledRuleSet).root;
  if (!root || typeof root !== "object") return null;
  return ruleSet as CompiledRuleSet;
}

function readSwitchConfig(config: Record<string, unknown>): SwitchNodeConfig | null {
  if (config.mode !== "switch") return null;
  const field = readString(config.field);
  if (!field) return null;
  const cases = Array.isArray(config.cases) ? config.cases : [];
  return {
    mode: "switch",
    field,
    cases: cases as SwitchNodeConfig["cases"],
    includeDefault: config.includeDefault !== false,
  };
}

async function executeDatePickerAction(
  context: ExecutionContext,
  deps?: AutomationActionDeps,
): Promise<NodeExecutionResult> {
  context = {
    ...context,
    variables: ensureConversationLanguage(context.variables, {
      text:
        (typeof context.input?.text === "string" && context.input.text) ||
        (typeof context.variables.lastMessage === "string" && context.variables.lastMessage) ||
        null,
    }),
  };
  const language = readConversationLanguage(context.variables);
  const localizedConfig = localizeNodeConfigForLanguage(context.currentNode.config, language);
  const inputKey =
    readString(localizedConfig.inputKey) ?? readString(localizedConfig.saveAs) ?? "selected_date";
  const prompt =
    localizeMessageText(localizedConfig, language) ??
    readString(localizedConfig.prompt) ??
    readString(localizedConfig.question);
  const pickerConfig = readDatePickerRuntimeConfig(localizedConfig);

  let constraints = null;
  if (deps?.businessCalendar) {
    constraints = await deps.businessCalendar.getDatePickerConstraints(context.company.id, pickerConfig);
  }

  const rawInput = context.input?.[inputKey] ?? context.input?.date ?? context.input?.value;
  const selectedDate = normalizeSelectedDate(rawInput);

  if (selectedDate) {
    if (constraints) {
      const validation = validateSelectedDate(selectedDate, constraints);
      if (!validation.ok) {
        return {
          outcome: "waiting_input",
          variables: mergeVariables(context.variables, {
            __waitingFor: inputKey,
            __prompt: prompt,
            __datePickerConstraints: constraints,
            __datePickerError: validation.reasonKey,
            __datePickerErrorParams: validation.reasonParams ?? null,
          }),
          output: { waitingFor: inputKey, invalidDate: selectedDate, reasonKey: validation.reasonKey },
        };
      }
    }

    const warningEntry = constraints?.entries.find(
      (entry) => entry.date === selectedDate && entry.warningOnly,
    );

    return {
      outcome: "continue",
      variables: mergeVariables(context.variables, {
        [inputKey]: selectedDate,
        __waitingFor: null,
        __prompt: null,
        __datePickerConstraints: null,
        __datePickerError: null,
        __datePickerErrorParams: null,
        ...(warningEntry
          ? {
              [`${inputKey}_holiday_warning`]: warningEntry.messageParams?.title ?? true,
            }
          : {}),
      }),
    };
  }

  return {
    outcome: "waiting_input",
    variables: mergeVariables(context.variables, {
      __waitingFor: inputKey,
      __prompt: prompt,
      __datePickerConstraints: constraints,
      __datePickerError: null,
      __datePickerErrorParams: null,
    }),
    output: { waitingFor: inputKey, datePicker: true },
  };
}

function buildListConfigWithSections(
  config: Record<string, unknown>,
  sections: InteractiveListSection[],
): Record<string, unknown> {
  return { ...config, sections };
}

function resolveListConfigForSelection(
  config: Record<string, unknown>,
  nodeId: string,
  variables: Record<string, unknown>,
  lookupSections: InteractiveListSection[] | null,
): Record<string, unknown> {
  const paginationState = readInteractiveListPaginationState(variables, nodeId);
  if (paginationState) {
    return buildListConfigWithSections(config, [
      { title: paginationState.sectionTitle, rows: paginationState.rows },
    ]);
  }
  if (lookupSections && lookupSections.length > 0) {
    return buildListConfigWithSections(config, lookupSections);
  }
  return config;
}

async function executeInteractiveMessageAction(
  context: ExecutionContext,
  action: "send_buttons" | "send_list",
  deps?: AutomationActionDeps,
): Promise<NodeExecutionResult> {
  const listLimits = resolveInteractiveListLimits(context.session.channel);
  const selection = context.input
    ? extractInteractiveSelection(context.input, { fallbackHint: action })
    : null;

  const inboundText =
    (typeof context.input?.text === "string" && context.input.text) ||
    (typeof context.input?.lastMessage === "string" && context.input.lastMessage) ||
    (typeof context.variables.lastMessage === "string" && context.variables.lastMessage) ||
    selection?.last_message ||
    null;

  context = {
    ...context,
    variables: ensureConversationLanguage(context.variables, {
      text: inboundText,
      selectionId: selection?.last_button_id,
    }),
  };
  const language = readConversationLanguage(context.variables);

  const recoveryArmed = context.variables[EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE] === true;
  if (recoveryArmed && (selection || inboundText)) {
    const recoveryId = resolveEmptyDoctorLookupRecoveryId({
      replyId: selection?.last_button_id,
      title: selection?.last_button_title,
      lastMessage: inboundText,
    });
    if (recoveryId === ANOTHER_DOCTOR_SELECTION_ID) {
      const servicesNode = findPrecedingServicesListNode(
        context.currentNode.id,
        context.nodes,
        context.edges,
      );
      return {
        outcome: "continue",
        variables: mergeVariables(context.variables, {
          ...emptyDoctorLookupRetryPatch(),
          __waitingFor: null,
          __prompt: null,
          ...clearLatestOutboundSlot(),
          ...clearInteractiveListPaginationState(),
        }),
        output: servicesNode
          ? { redirectToNodeId: servicesNode.id }
          : { redirectToPrimaryMenu: true },
      };
    }
    if (recoveryId === END_CHAT_SELECTION_ID) {
      const goodbye = emptyDoctorCatalogGoodbye(language);
      return {
        outcome: "completed",
        variables: mergeVariables(context.variables, {
          ...appendOutboundQueueEntry(context.variables, { kind: "text", text: goodbye }),
          [EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE]: null,
          __waitingFor: null,
          __prompt: goodbye,
        }),
        output: { endedConversation: true },
      };
    }
    const retryPrompt = emptyDoctorCatalogRecoveryOutbound(language);
    return {
      outcome: "waiting_input",
      variables: mergeVariables(context.variables, {
        ...appendOutboundQueueEntry(context.variables, retryPrompt),
        __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
        __prompt: retryPrompt.text,
        [EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE]: true,
      }),
      output: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, outbound: retryPrompt },
    };
  }

  if (selection) {
    const replyId = selection.last_button_id ?? "";

    if (action === "send_list" && isInteractiveListNextPageReply(replyId)) {
      const paginationState = readInteractiveListPaginationState(context.variables, context.currentNode.id);
      if (!paginationState) {
        return {
          outcome: "waiting_input",
          variables: mergeVariables(context.variables, {
            __prompt: "That selection was not valid. Please try again.",
          }),
          errorMessage: `List pagination state missing for node ${context.currentNode.id}.`,
        };
      }

      const nextPageIndex = paginationState.pageIndex + 1;
      if (nextPageIndex >= paginationState.totalPages) {
        return {
          outcome: "waiting_input",
          variables: mergeVariables(context.variables, {
            __prompt: "That selection was not valid. Please try again.",
          }),
          errorMessage: `List pagination page ${nextPageIndex} is out of range.`,
        };
      }

      const sections = buildPaginatedInteractiveListSections(
        paginationState.rows,
        nextPageIndex,
        listLimits,
        paginationState.sectionTitle,
      );
      const menuNode = {
        ...context.currentNode,
        config: buildListConfigWithSections(context.currentNode.config, sections),
      };
      const { outbound, prompt } = buildInteractiveMenuOutbound(menuNode, {
        language,
        variables: context.variables,
      });
      const queuePatch = appendOutboundQueueEntry(context.variables, outbound);
      const nextVariables = mergeVariables(context.variables, {
        ...mergeConversationVariables(context.variables, selection),
        [INTERACTIVE_LIST_PAGINATION_VARIABLE]: {
          ...paginationState,
          pageIndex: nextPageIndex,
        },
        __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
        __prompt: prompt,
        [INTERACTIVE_SELECTION_INPUT_KEY]: replyId,
        ...queuePatch,
      });

      return {
        outcome: "waiting_input",
        variables: nextVariables,
        output: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, outbound, listPagination: true },
      };
    }

    if (action === "send_list" && replyId) {
      let lookupSections: InteractiveListSection[] | null = null;
      const paginationState = readInteractiveListPaginationState(
        context.variables,
        context.currentNode.id,
      );
      if (isListLookupMode(context.currentNode.config) && !paginationState) {
        lookupSections = await resolveListNodeSections(
          context.currentNode,
          context.company.id,
          deps?.lookupOptions,
          context.variables,
          { runId: context.run.id, sessionId: context.session.id },
        );
      }

      const listConfig = resolveListConfigForSelection(
        context.currentNode.config,
        context.currentNode.id,
        context.variables,
        lookupSections,
      );

      const resolved = resolveInteractiveListSelection({
        config: listConfig,
        nodeId: context.currentNode.id,
        variables: context.variables,
        replyId,
        lookupSections,
      });

      if (!resolved.ok) {
        // Re-offer the list from the persisted catalog when possible.
        // When this replyId was already applied earlier in the run (duplicate Meta
        // webhook with a new wamid), CONTINUE — do not re-park on waiting_input.
        // Re-parking races the first delivery and rolls the run back onto the list
        // node (booking appears stuck after service selection).
        const alreadyApplied = Object.values(context.variables).some((value) => {
          if (value == null) return false;
          if (typeof value === "string") return value === replyId;
          if (typeof value === "object" && !Array.isArray(value)) {
            const record = value as Record<string, unknown>;
            return (
              record.id === replyId ||
              record.service_id === replyId ||
              record.resource_id === replyId ||
              record.value === replyId
            );
          }
          return false;
        });
        if (alreadyApplied) {
          const nextVariables = mergeVariables(context.variables, {
            ...mergeConversationVariables(context.variables, selection),
            [INTERACTIVE_SELECTION_INPUT_KEY]:
              selection.last_button_id ?? selection.last_button_title ?? replyId,
            __waitingFor: null,
            __prompt: null,
            ...clearLatestOutboundSlot(),
            ...clearInteractiveListPaginationState(),
          });
          traceListSelectionApplied({
            runId: context.run.id,
            sessionId: context.session.id,
            nodeId: context.currentNode.id,
            selection,
            variables: nextVariables,
          });
          return {
            outcome: "continue",
            variables: nextVariables,
            errorMessage: `Continued past duplicate interactive reply ${replyId} (already applied).`,
            output: { staleInteractiveReplyContinued: true },
          };
        }

        const catalogState = readInteractiveListPaginationState(
          context.variables,
          context.currentNode.id,
        );
        let reofferOutbound: OutboundQueueEntry | undefined;
        let reofferPrompt = resolved.userMessage;
        if (catalogState) {
          const sections = buildPaginatedInteractiveListSections(
            catalogState.rows,
            catalogState.pageIndex,
            listLimits,
            catalogState.sectionTitle,
          );
          const menuNode = {
            ...context.currentNode,
            config: buildListConfigWithSections(context.currentNode.config, sections),
          };
          const rebuilt = buildInteractiveMenuOutbound(menuNode, {
            language,
            variables: context.variables,
          });
          reofferOutbound = rebuilt.outbound;
          reofferPrompt = `${resolved.userMessage}\n\n${rebuilt.prompt ?? ""}`.trim();
        } else {
          reofferOutbound = { kind: "text", text: resolved.userMessage };
        }

        const queuePatch = appendOutboundQueueEntry(context.variables, reofferOutbound);
        return {
          outcome: "waiting_input",
          variables: mergeVariables(context.variables, {
            ...mergeConversationVariables(context.variables, selection),
            ...queuePatch,
            __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
            __prompt: reofferPrompt,
            [INTERACTIVE_SELECTION_INPUT_KEY]: replyId,
          }),
          errorMessage: resolved.errorMessage,
          output: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, selectionRestoreFailed: true },
        };
      }

      const nextVariables = mergeVariables(context.variables, {
        ...mergeConversationVariables(context.variables, selection),
        ...resolved.variablePatch,
        [INTERACTIVE_SELECTION_INPUT_KEY]:
          selection.last_button_id ?? selection.last_button_title ?? null,
        __waitingFor: null,
        __prompt: null,
        ...clearLatestOutboundSlot(),
        ...clearInteractiveListPaginationState(),
      });
      traceListSelectionApplied({
        runId: context.run.id,
        sessionId: context.session.id,
        nodeId: context.currentNode.id,
        selection,
        variables: nextVariables,
      });
      return {
        outcome: "continue",
        variables: nextVariables,
      };
    }

    const nextVariables = mergeVariables(context.variables, {
      ...mergeConversationVariables(context.variables, selection),
      [INTERACTIVE_SELECTION_INPUT_KEY]: selection.last_button_id ?? selection.last_button_title ?? null,
      __waitingFor: null,
      __prompt: null,
      ...clearLatestOutboundSlot(),
      ...clearInteractiveListPaginationState(),
    });
    traceListSelectionApplied({
      runId: context.run.id,
      sessionId: context.session.id,
      nodeId: context.currentNode.id,
      selection,
      variables: nextVariables,
    });
    return {
      outcome: "continue",
      variables: nextVariables,
    };
  }

  let outbound: OutboundQueueEntry | undefined;
  let prompt: string | null = null;

  const listVisitIndex =
    action === "send_list"
      ? logBeforeExecuteListNode({
          runId: context.run.id,
          sessionId: context.session.id,
          node: context.currentNode,
        })
      : undefined;

  let emptyAvailableDates = false;
  let emptyLookupCatalog = false;
  let emptyDoctorCatalogRecovery = false;
  let emptyDoctorCatalogNotice: string | null = null;
  let paginationStatePatch: Record<string, unknown> | undefined;

  const sendListMessage = async () => {
    let menuNode = context.currentNode;
    if (action === "send_list") {
      const lookupConfig = isListLookupMode(context.currentNode.config)
        ? readListLookupRuntimeConfig(context.currentNode.config)
        : null;
      const sections = await resolveListNodeSections(
        context.currentNode,
        context.company.id,
        deps?.lookupOptions,
        context.variables,
        { runId: context.run.id, sessionId: context.session.id },
      );
      if (sections.length === 0 && lookupConfig?.lookup === AVAILABLE_DATES_LOOKUP) {
        const emptyMessage = resolveAvailableDatesEmptyMessageFromConfig(context.currentNode.config, context.variables);
        outbound = { kind: "text", text: emptyMessage };
        prompt = emptyMessage;
        emptyAvailableDates = true;
        return;
      }
      if (sections.length === 0 && lookupConfig && isDoctorCatalogLookup(lookupConfig.lookup)) {
        const emptyMessage = emptyDoctorCatalogMessage(language);
        outbound = emptyDoctorCatalogRecoveryOutbound(language);
        prompt = outbound.text ?? emptyMessage;
        emptyDoctorCatalogRecovery = true;
        emptyDoctorCatalogNotice = emptyMessage;
        return;
      }
      if (
        sections.length === 0 &&
        (lookupConfig?.lookup === "services" ||
          lookupConfig?.lookup === "branches" ||
          lookupConfig?.lookup === "customer_bookings")
      ) {
        const language = readConversationLanguage(context.variables);
        const emptyMessage =
          lookupConfig.lookup === "customer_bookings"
            ? language === "en"
              ? "I couldn't find an upcoming appointment under that number."
              : "مش لاقي ميعاد قادم باسم حضرتك."
            : language === "en"
              ? "No options are available right now. Please try again later or contact support."
              : "لا توجد خيارات متاحة حالياً. من فضلك حاول لاحقاً أو تواصل مع الدعم.";
        outbound = { kind: "text", text: emptyMessage };
        prompt = emptyMessage;
        emptyLookupCatalog = true;
        return;
      }
      if (sections.length > 0) {
        const paginated = applyInteractiveListPaginationToSections(sections, {
          nodeId: context.currentNode.id,
          limits: listLimits,
          variables: context.variables,
        });
        menuNode = {
          ...context.currentNode,
          config: {
            ...context.currentNode.config,
            sections: paginated.sections,
          },
        };
        if (paginated.paginationState) {
          paginationStatePatch = {
            [INTERACTIVE_LIST_PAGINATION_VARIABLE]: paginated.paginationState,
          };
        }
      }
    }

    ({ outbound, prompt } = buildInteractiveMenuOutbound(menuNode, {
      language,
      variables: context.variables,
    }));
  };

  if (action === "send_list") {
    await sendListMessage();
    if (!outbound) {
      throw new Error(
        `send_list node ${context.currentNode.id} did not produce outbound payload (lookup=${String(context.currentNode.config.lookup ?? "static")}).`,
      );
    }
    // Clear this list's prior selection when (re)offering options so a previous
    // branch (e.g. pricing) cannot poison booking via the alreadyApplied path.
    const listOutputVariable = readInteractiveListOutputVariable(context.currentNode.config);
    const clearPriorSelection =
      !emptyAvailableDates &&
      !emptyLookupCatalog &&
      !emptyDoctorCatalogRecovery &&
      listOutputVariable
        ? { [listOutputVariable]: null }
        : {};
    const queuedVariables = emptyDoctorCatalogRecovery && emptyDoctorCatalogNotice
      ? appendOutboundQueueEntry(
          appendOutboundQueueEntry(context.variables, { kind: "text", text: emptyDoctorCatalogNotice }),
          outbound,
        )
      : appendOutboundQueueEntry(context.variables, outbound);
    const nextVariables = mergeVariables(context.variables, {
      ...queuedVariables,
      ...(paginationStatePatch ?? {}),
      ...clearPriorSelection,
      __waitingFor:
        emptyAvailableDates || emptyLookupCatalog ? null : INTERACTIVE_SELECTION_INPUT_KEY,
      __prompt: prompt,
      ...(emptyDoctorCatalogRecovery ? { [EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE]: true } : {}),
    });

    if (listVisitIndex !== undefined) {
      registerActiveListVisit(context.run.id, context.currentNode.id, listVisitIndex);
      logAfterSendListMessage({
        runId: context.run.id,
        sessionId: context.session.id,
        node: context.currentNode,
        listVisitIndex,
        outboundKind: outbound!.kind,
        outboundQueueLength: readOutboundQueue(nextVariables).length,
      });
    }

    const emptyCustomerBookings =
      emptyLookupCatalog &&
      isListLookupMode(context.currentNode.config) &&
      readListLookupRuntimeConfig(context.currentNode.config).lookup === "customer_bookings";

    return {
      // Never follow an empty appointment list into cancel_booking. Ending this
      // run is safer than letting a stale booking variable cancel a prior item.
      outcome: emptyCustomerBookings
        ? "completed"
        : emptyAvailableDates || emptyLookupCatalog
          ? "continue"
          : "waiting_input",
      variables: nextVariables,
      output: emptyAvailableDates || emptyLookupCatalog
        ? { sent: true, message: prompt, outbound: outbound! }
        : { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, outbound: outbound! },
    };
  }

  const displayVariables = withSelectionDisplayVariables(context.variables);
  ({ outbound, prompt } = buildInteractiveMenuOutbound(context.currentNode, {
    language,
    variables: displayVariables,
  }));

  const queuePatch = appendOutboundQueueEntry(displayVariables, outbound);
  const nextVariables = mergeVariables(displayVariables, {
    ...queuePatch,
    __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
    __prompt: prompt,
  });

  return {
    outcome: "waiting_input",
    variables: nextVariables,
    output: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, outbound },
  };
}

export const triggerNodeHandler: AutomationNodeHandler = {
  type: "trigger",
  validate(context) {
    if (context.currentNode.type !== "trigger") {
      throw new ValidationError("Trigger handler invoked for non-trigger node.");
    }
  },
  execute(context): NodeExecutionResult {
    const seed = (context.currentNode.config.initialVariables as Record<string, unknown> | undefined) ?? {};
    return {
      outcome: "continue",
      variables: mergeVariables(context.variables, seed),
      output: { triggered: true },
    };
  },
};

export function createActionNodeHandler(deps?: AutomationActionDeps): AutomationNodeHandler {
  return {
    type: "action",
    validate(context) {
      const action = readString(context.currentNode.config.action);
      if (!action) throw new ValidationError("Action node requires config.action.");
      if (action === "handoff_to_human") {
        validateHandoffToHumanConfig(context.currentNode.config);
      }
    },
    async execute(context): Promise<NodeExecutionResult> {
      const action = readString(context.currentNode.config.action)!;
      if (action === "set_variable") {
        const key = readString(context.currentNode.config.key);
        if (!key) throw new ValidationError("set_variable action requires config.key.");
        return {
          outcome: "continue",
          variables: mergeVariables(context.variables, { [key]: context.currentNode.config.value ?? null }),
        };
      }
      if (action === "pick_date") {
        return executeDatePickerAction(context, deps);
      }
      if (action === "wait_for_input" || action === "wait_for_reply") {
        const inputKey = readString(context.currentNode.config.inputKey) ?? "input";
        const resumeValue =
          context.input && context.input[inputKey] !== undefined
            ? context.input[inputKey]
            : null;
        // After a completed session restart: consume the inbound message as intent
        // without re-asking (and without replaying welcome).
        const prefilled =
          resumeValue === null &&
          context.variables.__reentryConsumeIntent === true &&
          inputKey === "customer_intent" &&
          context.variables[inputKey] !== undefined &&
          context.variables[inputKey] !== null &&
          String(context.variables[inputKey]).trim() !== ""
            ? context.variables[inputKey]
            : null;
        const resolvedInput = resumeValue !== null ? resumeValue : prefilled;
        const language = readConversationLanguage(context.variables);
        const localized = localizeNodeConfigForLanguage(context.currentNode.config, language);
        const prompt =
          localizeMessageText(localized, language) ??
          localized.prompt ??
          context.currentNode.config.prompt ??
          null;
        const promptText = typeof prompt === "string" ? prompt.trim() : "";
        // Greetings are not an intent. Consuming them sends AI Decision to "other"
        // → "وضح طلبك". Stay on the ask (or a help prompt if this node is clarify).
        if (resolvedInput !== null && isGreetingOnlyUtterance(String(resolvedInput))) {
          const nextPrompt = promptAfterGreetingOnlyInput({
            currentPrompt: promptText,
            language,
            inputKey,
          });
          const queuePatch = nextPrompt
            ? appendOutboundQueueEntry(context.variables, { kind: "text", text: nextPrompt })
            : {};
          return {
            outcome: "waiting_input",
            variables: mergeVariables(
              ensureConversationLanguage(context.variables, {
                text: String(resolvedInput),
              }),
              {
                ...queuePatch,
                [inputKey]: null,
                __waitingFor: inputKey,
                __prompt: nextPrompt,
                __reentryConsumeIntent: null,
                __reentrySkipWelcome: null,
              },
            ),
            output: { waitingFor: inputKey, ignoredGreeting: true },
          };
        }
        if (resolvedInput !== null) {
          return {
            outcome: "continue",
            variables: mergeVariables(
              ensureConversationLanguage(context.variables, {
                text: String(resolvedInput ?? ""),
              }),
              {
                [inputKey]: resolvedInput,
                __waitingFor: null,
                // Prevent stale ask prompts from being re-dispatched if a later node fails.
                __prompt: null,
                __reentryConsumeIntent: null,
              },
            ),
          };
        }
        // Queue the ask text so it is sent together with any earlier send_message
        // outbound (welcome → question) instead of being dropped by queue-only extract.
        const queuePatch = promptText
          ? appendOutboundQueueEntry(context.variables, { kind: "text", text: promptText })
          : {};
        return {
          outcome: "waiting_input",
          variables: mergeVariables(context.variables, {
            ...queuePatch,
            // Must come after queuePatch — appendOutboundQueueEntry spreads prior vars
            // (including a cleared __waitingFor) and would otherwise wipe these.
            __waitingFor: inputKey,
            __prompt: prompt,
          }),
          output: { waitingFor: inputKey },
        };
      }
      if (action === "merge_wait") {
        const strategy = readString(context.currentNode.config.strategy) ?? "all";
        return {
          outcome: "continue",
          variables: mergeVariables(context.variables, { __mergeStrategy: strategy }),
          output: { merged: true, strategy },
        };
      }
      if (action === "send_buttons" || action === "send_list") {
        return executeInteractiveMessageAction(context, action, deps);
      }
      if (action === "send_message") {
        // Re-entry after a finished run: skip the welcome send_message once, then continue
        // into intent ask / AI decision using the customer's new message.
        // Greetings must still receive the welcome — skipping them feeds "مرحبا" into
        // AI Decision as "other" and the flow asks "وضح طلبك".
        const reentryInbound =
          (typeof context.input?.lastMessage === "string" && context.input.lastMessage) ||
          (typeof context.variables.lastMessage === "string" && context.variables.lastMessage) ||
          (typeof context.variables.customer_intent === "string" && context.variables.customer_intent) ||
          "";
        if (context.variables.__reentrySkipWelcome === true && !isGreetingOnlyUtterance(reentryInbound)) {
          return {
            outcome: "continue",
            variables: mergeVariables(context.variables, {
              __reentrySkipWelcome: null,
            }),
          };
        }
        const language = readConversationLanguage(
          ensureConversationLanguage(context.variables, {
            text:
              (typeof context.input?.text === "string" && context.input.text) ||
              (typeof context.variables.lastMessage === "string" && context.variables.lastMessage) ||
              null,
          }),
        );
        const localizedConfig = localizeNodeConfigForLanguage(context.currentNode.config, language);
        const rawMessage =
          localizeMessageText(localizedConfig, language) ??
          readString(localizedConfig.message) ??
          readString(localizedConfig.text);
        if (!rawMessage) throw new ValidationError("send_message action requires config.message.");
        const displayVariables = withSelectionDisplayVariables(context.variables);
        const message = interpolateTemplateString(rawMessage, displayVariables);
        const imageUrl = readString(localizedConfig.url) ?? readString(localizedConfig.imageUrl);
        const outbound: OutboundQueueEntry = imageUrl
          ? {
              kind: "image",
              url: imageUrl,
              caption: message,
              text: message,
              mediaType: readString(localizedConfig.mediaType) ?? "image",
              mimeType: readString(localizedConfig.mimeType) ?? undefined,
            }
          : { kind: "text", text: message };
        return {
          outcome: "continue",
          variables: mergeVariables(
            ensureConversationLanguage(displayVariables, {
              text:
                (typeof context.input?.text === "string" && context.input.text) ||
                (typeof context.variables.lastMessage === "string" && context.variables.lastMessage) ||
                null,
            }),
            {
              ...appendOutboundQueueEntry(displayVariables, outbound),
              __prompt: message,
              __reentrySkipWelcome: null,
            },
          ),
          output: { sent: true, message },
        };
      }
      if (action === "create_booking") {
        if (!deps?.bookingService) {
          throw new ValidationError("Create booking action requires a booking service.");
        }
        const contract = validateNodeVariableContract({
          nodeType: "action",
          config: context.currentNode.config,
          variables: context.variables,
        });
        if (!contract.ok) {
          const outbound: OutboundQueueEntry = { kind: "text", text: contract.userMessage };
          return {
            outcome: "waiting_input",
            variables: mergeVariables(context.variables, {
              ...appendOutboundQueueEntry(context.variables, outbound),
              __waitingFor: "workflow_validation",
              __prompt: contract.userMessage,
            }),
            errorMessage: contract.violations.map((violation) => violation.message).join("; "),
            output: { workflowValidationFailed: true },
          };
        }
        try {
          return await executeCreateBookingAction(
            context,
            context.currentNode.config,
            deps.bookingService,
          );
        } catch (error) {
          if (error instanceof ValidationError) {
            const userMessage =
              "بعض بيانات الحجز ناقصة. من فضلك اختَر الخدمة/الوقت من القايمة مرة تانية.";
            const outbound: OutboundQueueEntry = { kind: "text", text: userMessage };
            return {
              outcome: "waiting_input",
              variables: mergeVariables(context.variables, {
                ...appendOutboundQueueEntry(context.variables, outbound),
                __waitingFor: "workflow_validation",
                __prompt: userMessage,
              }),
              errorMessage: error.message,
              output: { workflowValidationFailed: true },
            };
          }
          throw error;
        }
      }
      if (action === "find_booking") {
        if (!deps?.bookingService) {
          throw new ValidationError("Find booking action requires a booking service.");
        }
        return executeFindBookingAction(context, context.currentNode.config, deps.bookingService);
      }
      if (action === "update_booking") {
        if (!deps?.bookingService) {
          throw new ValidationError("Update booking action requires a booking service.");
        }
        return executeUpdateBookingAction(context, context.currentNode.config, deps.bookingService);
      }
      if (action === "cancel_booking") {
        if (!deps?.bookingService) {
          throw new ValidationError("Cancel booking action requires a booking service.");
        }
        return executeCancelBookingAction(context, context.currentNode.config, deps.bookingService);
      }
      if (action === "reschedule_booking") {
        if (!deps?.bookingService) {
          throw new ValidationError("Reschedule booking action requires a booking service.");
        }
        try {
          return await executeRescheduleBookingAction(
            context,
            context.currentNode.config,
            deps.bookingService,
          );
        } catch (error) {
          const userMessage =
            "تعذر تغيير الموعد المختار. قد يكون الموعد غير متاح أو انتهت مهلة التغيير؛ من فضلك ابدئي طلب التغيير مرة أخرى.";
          return {
            outcome: "completed",
            variables: mergeVariables(context.variables, {
              ...appendOutboundQueueEntry(context.variables, { kind: "text", text: userMessage }),
              __waitingFor: null,
              __prompt: userMessage,
            }),
            errorMessage: error instanceof Error ? error.message : String(error),
            output: { rescheduleFailed: true },
          };
        }
      }
      if (action === "find_customer") {
        if (!deps?.customerService) {
          throw new ValidationError("Find customer action requires a customer service.");
        }
        return executeFindCustomerAction(context, context.currentNode.config, deps.customerService);
      }
      if (action === "create_customer") {
        if (!deps?.customerService) {
          throw new ValidationError("Create customer action requires a customer service.");
        }
        return executeCreateCustomerAction(
          context,
          context.currentNode.config,
          deps.customerService,
          deps.conversationCustomerLink,
        );
      }
      if (action === "update_customer") {
        if (!deps?.customerService) {
          throw new ValidationError("Update customer action requires a customer service.");
        }
        return executeUpdateCustomerAction(context, context.currentNode.config, deps.customerService);
      }
      if (action === "create_ticket") {
        if (!deps?.ticketService) {
          throw new ValidationError("Create ticket action requires a ticket service.");
        }
        return executeCreateTicketAction(context, context.currentNode.config, deps.ticketService);
      }
      if (action === "find_ticket") {
        if (!deps?.ticketService) {
          throw new ValidationError("Find ticket action requires a ticket service.");
        }
        return executeFindTicketAction(context, context.currentNode.config, deps.ticketService);
      }
      if (action === "assign_ticket") {
        if (!deps?.ticketService) {
          throw new ValidationError("Assign ticket action requires a ticket service.");
        }
        return executeAssignTicketAction(context, context.currentNode.config, deps.ticketService);
      }
      if (action === "handoff_to_human") {
        if (!deps?.handoffService) {
          throw new ValidationError("handoff_to_human action requires a handoff service.");
        }
        return executeHandoffToHumanAction(context, context.currentNode.config, deps.handoffService);
      }
      if (action === "return_to_main_menu") {
        findPrimaryMenuNode(context.nodes);
        return {
          outcome: "continue",
          variables: mergeVariables(context.variables, { interactive_selection: null }),
          output: { redirectToPrimaryMenu: true },
        };
      }
      if (action === "fail") {
        return {
          outcome: "failed",
          errorMessage: readString(context.currentNode.config.message) ?? "Action node requested failure.",
        };
      }
      throw new ValidationError(`Unsupported action node action: ${action}`);
    },
  };
}

export const actionNodeHandler = createActionNodeHandler();

export const conditionNodeHandler: AutomationNodeHandler = {
  type: "condition",
  validate(context) {
    const switchConfig = readSwitchConfig(context.currentNode.config);
    if (switchConfig) {
      if (switchConfig.cases.length === 0) {
        throw new ValidationError("Switch node requires at least one case.");
      }
      return;
    }

    const ruleSet = readRuleSet(context.currentNode.config);
    if (ruleSet) {
      const issues = validateRuleSet(ruleSet);
      if (issues.length > 0) throw new ValidationError(issues[0]!);
      return;
    }

    const variable = readString(context.currentNode.config.variable);
    if (!variable) throw new ValidationError("Condition node requires config.variable or config.ruleSet.");
  },
  execute(context): NodeExecutionResult {
    const switchConfig = readSwitchConfig(context.currentNode.config);
    if (switchConfig) {
      const switchCase = evaluateSwitchCase(switchConfig, { variables: context.variables });
      return {
        outcome: "continue",
        variables: mergeVariables(context.variables, { __switchCase: switchCase }),
        output: { switchCase },
      };
    }

    const ruleSet = readRuleSet(context.currentNode.config);
    if (ruleSet) {
      const { branch, evaluation } = executeIfRuleSetWithTrace(context, ruleSet);
      return {
        outcome: "continue",
        variables: mergeVariables(context.variables, { __branch: branch }),
        output: { branch, matchedRuleIndex: evaluation.matchedRuleIndex },
      };
    }

    const variable = readString(context.currentNode.config.variable)!;
    const expected = context.currentNode.config.equals;
    const actual = context.variables[variable];
    const branch = actual === expected ? "yes" : "no";
    traceIfNodeEntered(context);
    traceLegacyIfNodeEvaluation({ context, variable, expected, actual, branch });
    return {
      outcome: "continue",
      variables: mergeVariables(context.variables, { __branch: branch }),
      output: { branch, matchedRuleIndex: branch === "yes" ? 0 : 0 },
    };
  },
};

export const delayNodeHandler: AutomationNodeHandler = {
  type: "delay",
  validate() {
    /* delay nodes are valid with empty config for synchronous engine */
  },
  execute(context): NodeExecutionResult {
    const config = context.currentNode.config;
    const duration = Number(config.duration ?? config.waitMinutes ?? 0);
    const unit = readString(config.unit) ?? "minutes";
    const marker = readString(config.marker);
    return {
      outcome: "continue",
      variables: mergeVariables(context.variables, {
        ...(marker ? { __delayMarker: marker } : {}),
        __delayUntil: {
          duration,
          unit,
          businessHoursOnly: config.businessHoursOnly === true,
        },
      }),
    };
  },
};

export const endNodeHandler: AutomationNodeHandler = {
  type: "end",
  validate() {
    /* terminal node */
  },
  execute(context): NodeExecutionResult {
    return {
      outcome: "completed",
      variables: context.variables,
      output: { finished: true },
    };
  },
};

export function createBuiltInAutomationNodeHandlers(deps?: AutomationActionDeps): AutomationNodeHandler[] {
  return [triggerNodeHandler, createActionNodeHandler(deps), conditionNodeHandler, delayNodeHandler, endNodeHandler];
}
