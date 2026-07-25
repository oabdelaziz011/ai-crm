import { ValidationError } from "../errors.js";
import type { AutomationNodeRecord } from "../types.js";
import type { OutboundQueueEntry } from "./outbound-queue.js";

export const PRIMARY_MENU_CONFIG_KEY = "primaryMenu";

export const REDIRECT_TO_PRIMARY_MENU_OUTPUT = "redirectToPrimaryMenu";

type InteractiveButtonOption = { id: string; label: string };

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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

export function isInteractiveMenuNode(node: AutomationNodeRecord): boolean {
  const action = readString(node.config.action);
  return action === "send_buttons" || action === "send_list";
}

export function isPrimaryMenuNode(node: AutomationNodeRecord): boolean {
  return isInteractiveMenuNode(node) && node.config[PRIMARY_MENU_CONFIG_KEY] === true;
}

export function buildInteractiveMenuOutbound(
  menuNode: AutomationNodeRecord,
): { outbound: OutboundQueueEntry; prompt: string } {
  const action = readString(menuNode.config.action);
  if (action === "send_buttons") {
    const message = readString(menuNode.config.message);
    if (!message) throw new ValidationError("Main menu buttons step requires config.message.");
    const buttons = readInteractiveButtons(menuNode.config);
    if (buttons.length === 0) {
      throw new ValidationError("Main menu buttons step requires at least one button.");
    }
    return { outbound: { kind: "buttons", text: message, buttons }, prompt: message };
  }

  if (action === "send_list") {
    const title = readString(menuNode.config.title);
    const body = readString(menuNode.config.body);
    const buttonLabel = readString(menuNode.config.buttonLabel) ?? "View options";
    const sections = readListSections(menuNode.config);
    if (!title || !body) {
      throw new ValidationError("Main menu list step requires config.title and config.body.");
    }
    if (sections.length === 0) {
      throw new ValidationError("Main menu list step requires at least one list row.");
    }
    return {
      outbound: { kind: "list", title, body, buttonLabel, sections },
      prompt: body,
    };
  }

  throw new ValidationError("Primary Menu must be a Buttons or List step.");
}

export function findPrimaryMenuNode(nodes: AutomationNodeRecord[]): AutomationNodeRecord {
  const matches = nodes.filter(isPrimaryMenuNode);
  if (matches.length === 0) {
    throw new ValidationError(
      "This workflow has no Primary Menu. Mark one Buttons or List step as the Primary Menu.",
    );
  }
  if (matches.length > 1) {
    throw new ValidationError("This workflow has multiple Primary Menu steps. Only one is allowed.");
  }
  return matches[0]!;
}

export function shouldRedirectToPrimaryMenu(output: Record<string, unknown> | undefined): boolean {
  return output?.[REDIRECT_TO_PRIMARY_MENU_OUTPUT] === true;
}
