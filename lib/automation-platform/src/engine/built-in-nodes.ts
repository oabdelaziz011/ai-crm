import { ValidationError } from "../errors.js";
import {
  evaluateSwitchCase,
  validateRuleSet,
  type CompiledRuleSet,
  type SwitchNodeConfig,
} from "../logic/index.js";
import {
  extractInteractiveSelection,
  INTERACTIVE_SELECTION_INPUT_KEY,
  mergeConversationVariables,
} from "../runtime/conversation-variables.js";
import {
  readInteractiveListInputKey,
  readInteractiveListOutputVariable,
  resolveInteractiveListStoredRecord,
  resolveInteractiveListStoredValue,
} from "../runtime/interactive-list-variable.js";
import {
  buildInteractiveMenuOutbound,
  findPrimaryMenuNode,
} from "../runtime/main-menu.js";
import {
  appendOutboundQueueEntry,
  clearLatestOutboundSlot,
  readOutboundQueue,
  type OutboundQueueEntry,
} from "../runtime/outbound-queue.js";
import type { BookingServicePort } from "../ports/booking-service-port.js";
import type { CustomerServicePort } from "../ports/customer-service-port.js";
import type { ConversationCustomerLinkPort } from "../ports/conversation-customer-link-port.js";
import { executeCreateBookingAction } from "./crm/create-booking-action.js";
import { executeFindBookingAction } from "./crm/find-booking-action.js";
import { executeCancelBookingAction, executeUpdateBookingAction } from "./crm/update-booking-action.js";
import { executeCreateCustomerAction, executeUpdateCustomerAction } from "./crm/create-customer-action.js";
import { executeFindCustomerAction } from "./crm/find-customer-action.js";
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
import { isListLookupMode, resolveListNodeSections } from "../runtime/list-lookup-resolver.js";

export type AutomationActionDeps = {
  bookingService?: BookingServicePort;
  customerService?: CustomerServicePort;
  conversationCustomerLink?: ConversationCustomerLinkPort;
  lookupOptions?: LookupOptionsPort;
  businessCalendar?: BusinessCalendarPort;
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
  const inputKey = readString(context.currentNode.config.inputKey) ?? readString(context.currentNode.config.saveAs) ?? "selected_date";
  const prompt = readString(context.currentNode.config.prompt) ?? readString(context.currentNode.config.question);
  const pickerConfig = readDatePickerRuntimeConfig(context.currentNode.config);

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

async function executeInteractiveMessageAction(
  context: ExecutionContext,
  action: "send_buttons" | "send_list",
  deps?: AutomationActionDeps,
): Promise<NodeExecutionResult> {
  const selection = context.input
    ? extractInteractiveSelection(context.input, { fallbackHint: action })
    : null;
  if (selection) {
    const selectionVariablePatch: Record<string, unknown> = {};
    if (action === "send_list") {
      const inputKey = readInteractiveListInputKey(context.currentNode.config);
      const outputVariable = readInteractiveListOutputVariable(context.currentNode.config);
      const replyId = selection.last_button_id ?? "";
      if (replyId) {
        let listConfig = context.currentNode.config;
        if (isListLookupMode(listConfig)) {
          const sections = await resolveListNodeSections(
            context.currentNode,
            context.company.id,
            deps?.lookupOptions,
            context.variables,
          );
          if (sections.length > 0) {
            listConfig = { ...listConfig, sections };
          }
        }
        const storedRecord = resolveInteractiveListStoredRecord(listConfig, replyId);
        if (storedRecord && outputVariable) {
          selectionVariablePatch[outputVariable] = storedRecord;
        } else if (inputKey) {
          const storedValue = resolveInteractiveListStoredValue(listConfig, replyId);
          if (storedValue !== null) {
            selectionVariablePatch[inputKey] = storedValue;
          }
        }
      }
    }

    const nextVariables = mergeVariables(context.variables, {
      ...mergeConversationVariables(context.variables, selection),
      ...selectionVariablePatch,
      [INTERACTIVE_SELECTION_INPUT_KEY]: selection.last_button_id ?? selection.last_button_title ?? null,
      __waitingFor: null,
      __prompt: null,
      ...clearLatestOutboundSlot(),
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

  const sendListMessage = async () => {
    let menuNode = context.currentNode;
    if (action === "send_list") {
      const sections = await resolveListNodeSections(
        context.currentNode,
        context.company.id,
        deps?.lookupOptions,
        context.variables,
      );
      if (sections.length > 0) {
        menuNode = {
          ...context.currentNode,
          config: {
            ...context.currentNode.config,
            sections,
          },
        };
      }
    }

    ({ outbound, prompt } = buildInteractiveMenuOutbound(menuNode));
  };

  if (action === "send_list") {
    await sendListMessage();
    const queuePatch = appendOutboundQueueEntry(context.variables, outbound!);
    const nextVariables = mergeVariables(context.variables, {
      ...queuePatch,
      __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
      __prompt: prompt,
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

    return {
      outcome: "waiting_input",
      variables: nextVariables,
      output: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, outbound: outbound! },
    };
  }

  ({ outbound, prompt } = buildInteractiveMenuOutbound(context.currentNode));

  const queuePatch = appendOutboundQueueEntry(context.variables, outbound);
  const nextVariables = mergeVariables(context.variables, {
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
    },
    execute(context): NodeExecutionResult | Promise<NodeExecutionResult> {
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
        if (context.input && context.input[inputKey] !== undefined) {
          return {
            outcome: "continue",
            variables: mergeVariables(context.variables, {
              [inputKey]: context.input[inputKey],
              __waitingFor: null,
            }),
          };
        }
        return {
          outcome: "waiting_input",
          variables: mergeVariables(context.variables, {
            __waitingFor: inputKey,
            __prompt: context.currentNode.config.prompt ?? null,
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
        const message =
          readString(context.currentNode.config.message) ?? readString(context.currentNode.config.text);
        if (!message) throw new ValidationError("send_message action requires config.message.");
        const imageUrl = readString(context.currentNode.config.url) ?? readString(context.currentNode.config.imageUrl);
        const outbound: OutboundQueueEntry = imageUrl
          ? {
              kind: "image",
              url: imageUrl,
              caption: message,
              text: message,
              mediaType: readString(context.currentNode.config.mediaType) ?? "image",
              mimeType: readString(context.currentNode.config.mimeType) ?? undefined,
            }
          : { kind: "text", text: message };
        return {
          outcome: "continue",
          variables: mergeVariables(context.variables, {
            ...appendOutboundQueueEntry(context.variables, outbound),
            __prompt: message,
          }),
          output: { sent: true, message },
        };
      }
      if (action === "create_booking") {
        if (!deps?.bookingService) {
          throw new ValidationError("Create booking action requires a booking service.");
        }
        return executeCreateBookingAction(context, context.currentNode.config, deps.bookingService);
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
