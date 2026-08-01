import {
  appendOutboundQueueEntry,
  evaluateIfElseCondition,
  evaluateSwitchCase,
  INTERACTIVE_SELECTION_INPUT_KEY,
  type AutomationNodeRecord,
  type CompiledRuleSet,
  type NodeExecutionResult,
  type OutboundQueueEntry,
  type SwitchNodeConfig,
} from "@workspace/automation-platform";

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

const CRM_ACTIONS = new Set([
  "create_customer",
  "update_customer",
  "find_customer",
  "create_booking",
  "find_booking",
  "update_booking",
  "cancel_booking",
]);

const AI_ACTIONS = new Set([
  "ai_summarizer",
  "ai_extract",
  "ai_decision",
  "ai_knowledge_search",
  "ai_classify",
  "ai_generate",
]);

export type SimulationNodeExecutionResult = {
  result: NodeExecutionResult;
  branch?: string;
  switchCase?: string;
  outputs: Record<string, unknown>;
  decisionLabel?: string;
};

export type SimulationNodeExecutionOptions = {
  simulatedInput?: Record<string, unknown>;
};

function tryResumeWaitingNode(
  node: AutomationNodeRecord,
  variables: Record<string, unknown>,
  simulatedInput: Record<string, unknown>,
): SimulationNodeExecutionResult | null {
  const waitingFor = variables.__waitingFor;
  if (typeof waitingFor !== "string" || !waitingFor.trim()) {
    return null;
  }

  const action = readString(node.config.action) ?? readString(node.config.__builderType) ?? "";
  const builderType = readString(node.config.__builderType);

  if (waitingFor === INTERACTIVE_SELECTION_INPUT_KEY) {
    const selection =
      simulatedInput[INTERACTIVE_SELECTION_INPUT_KEY] ??
      simulatedInput.selection ??
      pickDefaultInteractiveSelection(node);
    const outputKey = readString(node.config.outputVariable) ?? readString(node.config.saveAs);
    return {
      result: {
        outcome: "continue",
        variables: {
          ...variables,
          __waitingFor: null,
          __prompt: null,
          [INTERACTIVE_SELECTION_INPUT_KEY]: selection,
          ...(outputKey ? { [outputKey]: selection } : {}),
        },
        output: { selection, simulated: true, sideEffectsBlocked: true },
      },
      outputs: { selection, simulated: true, sideEffectsBlocked: true },
      decisionLabel: `Simulated selection "${selection}"`,
    };
  }

  if (action === "pick_date" || builderType === "date_picker") {
    const inputKey = readString(node.config.inputKey) ?? readString(node.config.saveAs) ?? waitingFor;
    const selectedDate =
      simulatedInput[inputKey] ?? simulatedInput.date ?? simulatedInput.value ?? "2026-08-15";
    return {
      result: {
        outcome: "continue",
        variables: {
          ...variables,
          [inputKey]: selectedDate,
          __waitingFor: null,
          __prompt: null,
          __datePickerConstraints: null,
          __datePickerError: null,
          __datePickerErrorParams: null,
        },
        output: { selectedDate, simulated: true },
      },
      outputs: { selectedDate, simulated: true },
    };
  }

  const inputValue = simulatedInput[waitingFor] ?? simulatedInput.input ?? simulatedInput.reply ?? "[Simulated reply]";
  return {
    result: {
      outcome: "continue",
      variables: {
        ...variables,
        [waitingFor]: inputValue,
        __waitingFor: null,
        __prompt: null,
      },
      output: { [waitingFor]: inputValue, simulated: true },
    },
    outputs: { [waitingFor]: inputValue, simulated: true },
  };
}

function pickDefaultInteractiveSelection(node: AutomationNodeRecord): string {
  const action = readString(node.config.action) ?? readString(node.config.__builderType) ?? "";
  const builderType = readString(node.config.__builderType);

  if (action === "send_list" || builderType === "list") {
    const rows = Array.isArray(node.config.rows) ? node.config.rows : [];
    const firstRow = rows[0] as { id?: string; title?: string } | undefined;
    return readString(firstRow?.id) ?? readString(firstRow?.title) ?? "option-1";
  }

  const buttons = Array.isArray(node.config.buttons) ? node.config.buttons : [];
  const firstButton = buttons[0] as { id?: string; label?: string } | undefined;
  return readString(firstButton?.id) ?? readString(firstButton?.label) ?? "option-1";
}

function executeInteractiveMessageMock(
  node: AutomationNodeRecord,
  variables: Record<string, unknown>,
  action: "send_buttons" | "send_list",
): SimulationNodeExecutionResult {
  const prompt =
    readString(node.config.message) ??
    readString(node.config.body) ??
    readString(node.config.title) ??
    "[Interactive menu — simulation preview]";

  const outbound: OutboundQueueEntry =
    action === "send_list"
      ? {
          kind: "list",
          title: readString(node.config.title) ?? "Choose an option",
          body: readString(node.config.body) ?? prompt,
          buttonLabel: readString(node.config.buttonLabel) ?? "View options",
          sections: Array.isArray(node.config.sections)
            ? (node.config.sections as OutboundQueueEntry["sections"])
            : Array.isArray(node.config.rows)
              ? [
                  {
                    title: readString(node.config.title) ?? "Options",
                    rows: node.config.rows as Array<{ id: string; title: string; description?: string }>,
                  },
                ]
              : [],
        }
      : {
          kind: "buttons",
          text: prompt,
          buttons: Array.isArray(node.config.buttons)
            ? (node.config.buttons as Array<{ id: string; label: string }>)
            : [],
        };

  const queuePatch = appendOutboundQueueEntry(variables, outbound);
  const nextVariables = {
    ...variables,
    ...queuePatch,
    __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
    __prompt: prompt,
  };

  return {
    result: {
      outcome: "waiting_input",
      variables: nextVariables,
      output: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, outbound, simulated: true },
    },
    outputs: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, outbound, simulated: true },
  };
}

function executeDatePickerMock(
  node: AutomationNodeRecord,
  variables: Record<string, unknown>,
): SimulationNodeExecutionResult {
  const inputKey = readString(node.config.inputKey) ?? readString(node.config.saveAs) ?? "selected_date";
  const prompt = readString(node.config.prompt) ?? readString(node.config.question) ?? "Select a date";

  return {
    result: {
      outcome: "waiting_input",
      variables: {
        ...variables,
        __waitingFor: inputKey,
        __prompt: prompt,
        __datePickerConstraints: { simulated: true, providerBlocked: true },
        __datePickerError: null,
        __datePickerErrorParams: null,
      },
      output: { waitingFor: inputKey, datePicker: true, simulated: true },
    },
    outputs: { waitingFor: inputKey, datePicker: true, simulated: true },
  };
}

function executeCrmMock(
  node: AutomationNodeRecord,
  variables: Record<string, unknown>,
  action: string,
): SimulationNodeExecutionResult {
  const mockId = `sim-${action}-${node.id.slice(0, 8)}`;
  const outputKey = readString(node.config.outputVariable) ?? `${action}_result`;
  const mockPayload = {
    id: mockId,
    action,
    simulated: true,
    sideEffectsBlocked: true,
    found: action.startsWith("find_") ? false : undefined,
  };

  return {
    result: {
      outcome: "continue",
      variables: { ...variables, [outputKey]: mockPayload },
      output: mockPayload,
    },
    outputs: mockPayload,
  };
}

function executeAiMock(
  node: AutomationNodeRecord,
  variables: Record<string, unknown>,
  action: string,
): SimulationNodeExecutionResult {
  const outputKey = readString(node.config.outputVariable) ?? "ai_result";
  const mockResult = {
    simulated: true,
    providerBlocked: true,
    action,
    summary: "[Simulation preview — no LLM execution]",
    extracted: {},
    decision: "simulated",
    matches: [],
  };

  return {
    result: {
      outcome: "continue",
      variables: { ...variables, [outputKey]: mockResult },
      output: mockResult,
    },
    outputs: mockResult,
  };
}

export function executeSimulationNode(
  node: AutomationNodeRecord,
  variables: Record<string, unknown>,
  options: SimulationNodeExecutionOptions = {},
): SimulationNodeExecutionResult {
  if (options.simulatedInput && variables.__waitingFor) {
    const resumed = tryResumeWaitingNode(node, variables, options.simulatedInput);
    if (resumed) return resumed;
  }

  if (node.type === "trigger" || readString(node.config.__builderType) === "start") {
    const seed = (node.config.initialVariables as Record<string, unknown> | undefined) ?? {};
    return {
      result: { outcome: "continue", variables: { ...variables, ...seed }, output: { triggered: true } },
      outputs: { triggered: true },
    };
  }

  if (node.type === "end" || readString(node.config.__builderType) === "end") {
    return {
      result: { outcome: "completed", variables, output: { completed: true } },
      outputs: { completed: true },
    };
  }

  if (node.type === "delay") {
    const durationMs = Number(node.config.durationMs ?? node.config.duration ?? 0);
    return {
      result: {
        outcome: "continue",
        variables,
        output: { delayedMs: durationMs, simulated: true },
      },
      outputs: { delayedMs: durationMs, simulated: true },
    };
  }

  if (node.type === "condition") {
    if (node.config.mode === "switch") {
      const switchConfig = readSwitchConfig(node.config);
      const switchCase = switchConfig ? evaluateSwitchCase(switchConfig, { variables }) : "default";
      return {
        result: {
          outcome: "continue",
          variables: { ...variables, __switchCase: switchCase },
        },
        switchCase,
        decisionLabel: `Switch matched case "${switchCase}"`,
        outputs: { switchCase },
      };
    }

    const ruleSet = readRuleSet(node.config);
    const branch = ruleSet ? evaluateIfElseCondition(ruleSet, { variables }) : "no";
    return {
      result: {
        outcome: "continue",
        variables: { ...variables, __branch: branch },
      },
      branch,
      decisionLabel: `If/else evaluated to "${branch}"`,
      outputs: { branch },
    };
  }

  const action = readString(node.config.action) ?? readString(node.config.__builderType) ?? "action";
  const builderType = readString(node.config.__builderType);

  if (
    action === "send_buttons" ||
    action === "send_list" ||
    builderType === "buttons" ||
    builderType === "list"
  ) {
    const interactiveAction = action === "send_list" || builderType === "list" ? "send_list" : "send_buttons";
    return executeInteractiveMessageMock(node, variables, interactiveAction);
  }

  if (action === "pick_date" || builderType === "date_picker") {
    return executeDatePickerMock(node, variables);
  }

  if (action === "wait_for_input" || action === "wait_for_reply" || builderType === "wait_for_reply") {
    const inputKey = readString(node.config.inputKey) ?? readString(node.config.saveAs) ?? "input";
    const prompt = readString(node.config.prompt) ?? readString(node.config.question);
    return {
      result: {
        outcome: "waiting_input",
        variables: {
          ...variables,
          __waitingFor: inputKey,
          __prompt: prompt,
        },
        output: { waitingFor: inputKey, simulated: true },
      },
      outputs: { waitingFor: inputKey, simulated: true },
    };
  }

  if (action === "set_variable") {
    const key = readString(node.config.key);
    const value = node.config.value ?? null;
    if (!key) {
      return {
        result: { outcome: "failed", errorMessage: "set_variable requires config.key", variables },
        outputs: {},
      };
    }
    return {
      result: {
        outcome: "continue",
        variables: { ...variables, [key]: value },
        output: { key, value, simulated: true },
      },
      outputs: { key, value, simulated: true },
    };
  }

  if (action === "merge_wait" || builderType === "merge") {
    return {
      result: {
        outcome: "continue",
        variables: { ...variables, __mergeStrategy: node.config.strategy ?? "all" },
        output: { merged: true, simulated: true },
      },
      outputs: { merged: true, simulated: true },
    };
  }

  if (CRM_ACTIONS.has(action) || (builderType != null && CRM_ACTIONS.has(builderType))) {
    return executeCrmMock(node, variables, CRM_ACTIONS.has(action) ? action : builderType!);
  }

  if (AI_ACTIONS.has(action) || action.startsWith("ai_") || builderType?.startsWith("ai_")) {
    return executeAiMock(node, variables, AI_ACTIONS.has(action) ? action : builderType ?? action);
  }

  const message =
    readString(node.config.message) ??
    readString(node.config.text) ??
    readString(node.config.prompt) ??
    readString(node.config.question) ??
    `[Simulated ${action}]`;

  return {
    result: {
      outcome: "continue",
      variables,
      output: { action, message, simulated: true, sideEffectsBlocked: true },
    },
    outputs: { action, message, simulated: true, sideEffectsBlocked: true },
  };
}
