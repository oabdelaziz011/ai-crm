import { ValidationError } from "../errors.js";
import {
  evaluateIfElseCondition,
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
import type { BookingServicePort } from "../ports/booking-service-port.js";
import type { CustomerServicePort } from "../ports/customer-service-port.js";
import { executeCreateBookingAction } from "./crm/create-booking-action.js";
import { executeFindCustomerAction } from "./crm/find-customer-action.js";
import type { AutomationNodeHandler, ExecutionContext, NodeExecutionResult } from "./execution-context.js";
import { mergeVariables } from "./execution-context.js";

export type AutomationActionDeps = {
  bookingService?: BookingServicePort;
  customerService?: CustomerServicePort;
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

type InteractiveButtonOption = { id: string; label: string };

function readInteractiveButtons(config: Record<string, unknown>): InteractiveButtonOption[] {
  if (!Array.isArray(config.buttons)) return [];
  return config.buttons.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const id = readString((entry as { id?: unknown }).id);
    const label = readString((entry as { label?: unknown }).label);
    if (!id || !label) return [];
    return [{ id, label }];
  });
}

function readListSections(config: Record<string, unknown>): Array<{
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}> {
  if (!Array.isArray(config.sections)) return [];
  return config.sections.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const title = readString((section as { title?: unknown }).title) ?? "Options";
    const rows = Array.isArray((section as { rows?: unknown }).rows)
      ? (section as { rows: unknown[] }).rows.flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const id = readString((row as { id?: unknown }).id);
          const rowTitle = readString((row as { title?: unknown }).title);
          if (!id || !rowTitle) return [];
          const description = readString((row as { description?: unknown }).description) ?? undefined;
          return [{ id, title: rowTitle, ...(description ? { description } : {}) }];
        })
      : [];
    if (rows.length === 0) return [];
    return [{ title, rows }];
  });
}

function executeInteractiveMessageAction(context: ExecutionContext, action: "send_buttons" | "send_list"): NodeExecutionResult {
  const selection = context.input
    ? extractInteractiveSelection(context.input, { fallbackHint: action })
    : null;
  if (selection) {
    return {
      outcome: "continue",
      variables: mergeVariables(context.variables, {
        ...mergeConversationVariables(context.variables, selection),
        [INTERACTIVE_SELECTION_INPUT_KEY]: selection.last_button_title ?? selection.last_button_id ?? null,
        __waitingFor: null,
        __prompt: null,
        __outbound: null,
      }),
    };
  }

  let outbound: Record<string, unknown>;
  let prompt: string | null;

  if (action === "send_buttons") {
    const message = readString(context.currentNode.config.message);
    if (!message) throw new ValidationError("send_buttons action requires config.message.");
    const buttons = readInteractiveButtons(context.currentNode.config);
    if (buttons.length === 0) {
      throw new ValidationError("send_buttons action requires at least one button.");
    }
    outbound = { kind: "buttons", text: message, buttons };
    prompt = message;
  } else {
    const title = readString(context.currentNode.config.title);
    const body = readString(context.currentNode.config.body);
    const buttonLabel = readString(context.currentNode.config.buttonLabel) ?? "View options";
    const sections = readListSections(context.currentNode.config);
    if (!title || !body) {
      throw new ValidationError("send_list action requires config.title and config.body.");
    }
    if (sections.length === 0) {
      throw new ValidationError("send_list action requires at least one list row.");
    }
    outbound = { kind: "list", title, body, buttonLabel, sections };
    prompt = body;
  }

  return {
    outcome: "waiting_input",
    variables: mergeVariables(context.variables, {
      __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
      __prompt: prompt,
      __outbound: outbound,
    }),
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
        return executeInteractiveMessageAction(context, action);
      }
      if (action === "create_booking") {
        if (!deps?.bookingService) {
          throw new ValidationError("Create booking action requires a booking service.");
        }
        return executeCreateBookingAction(context, context.currentNode.config, deps.bookingService);
      }
      if (action === "find_customer") {
        if (!deps?.customerService) {
          throw new ValidationError("Find customer action requires a customer service.");
        }
        return executeFindCustomerAction(context, context.currentNode.config, deps.customerService);
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
      const branch = evaluateIfElseCondition(ruleSet, { variables: context.variables });
      return {
        outcome: "continue",
        variables: mergeVariables(context.variables, { __branch: branch }),
        output: { branch },
      };
    }

    const variable = readString(context.currentNode.config.variable)!;
    const expected = context.currentNode.config.equals;
    const actual = context.variables[variable];
    const branch = actual === expected ? "yes" : "no";
    return {
      outcome: "continue",
      variables: mergeVariables(context.variables, { __branch: branch }),
      output: { branch },
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
