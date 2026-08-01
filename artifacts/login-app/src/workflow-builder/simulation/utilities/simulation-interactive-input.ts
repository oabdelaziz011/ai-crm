import { INTERACTIVE_SELECTION_INPUT_KEY, type AutomationNodeRecord } from "@workspace/automation-platform";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

export function buildDefaultSimulatedInput(
  node: AutomationNodeRecord,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const waitingFor = variables.__waitingFor;
  if (typeof waitingFor !== "string" || !waitingFor.trim()) {
    return {};
  }

  if (waitingFor === INTERACTIVE_SELECTION_INPUT_KEY) {
    return {
      [INTERACTIVE_SELECTION_INPUT_KEY]: pickDefaultInteractiveSelection(node),
    };
  }

  const action = readString(node.config.action) ?? readString(node.config.__builderType) ?? "";
  const builderType = readString(node.config.__builderType);

  if (action === "pick_date" || builderType === "date_picker") {
    const inputKey = readString(node.config.inputKey) ?? readString(node.config.saveAs) ?? waitingFor;
    return { [inputKey]: "2026-08-15" };
  }

  return { [waitingFor]: "[Simulated reply]" };
}
