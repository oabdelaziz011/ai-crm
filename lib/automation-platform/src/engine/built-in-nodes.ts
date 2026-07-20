import { ValidationError } from "../errors.js";
import {
  evaluateIfElseCondition,
  evaluateSwitchCase,
  validateRuleSet,
  type CompiledRuleSet,
  type SwitchNodeConfig,
} from "../logic/index.js";
import type { AutomationNodeHandler, ExecutionContext, NodeExecutionResult } from "./execution-context.js";
import { mergeVariables } from "./execution-context.js";

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

export const actionNodeHandler: AutomationNodeHandler = {
  type: "action",
  validate(context) {
    const action = readString(context.currentNode.config.action);
    if (!action) throw new ValidationError("Action node requires config.action.");
  },
  execute(context): NodeExecutionResult {
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
    if (action === "fail") {
      return {
        outcome: "failed",
        errorMessage: readString(context.currentNode.config.message) ?? "Action node requested failure.",
      };
    }
    throw new ValidationError(`Unsupported action node action: ${action}`);
  },
};

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

export function createBuiltInAutomationNodeHandlers(): AutomationNodeHandler[] {
  return [triggerNodeHandler, actionNodeHandler, conditionNodeHandler, delayNodeHandler, endNodeHandler];
}
