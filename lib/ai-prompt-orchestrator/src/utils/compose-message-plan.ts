import {
  CONVERSATION_TOOL_DEVELOPER_INSTRUCTIONS,
  DEVELOPER_PROMPT_SECTION_KEYS,
  SYSTEM_PROMPT_SECTION_KEYS,
  type PromptOrchestrationMode,
} from "../constants.js";
import type { PromptSectionKey } from "../constants.js";
import type {
  BuiltPromptSection,
  OutputContract,
  PromptMessage,
  PromptMessagePlan,
} from "../types.js";

const SYSTEM_KEYS = new Set<PromptSectionKey>(SYSTEM_PROMPT_SECTION_KEYS);
const DEVELOPER_KEYS = new Set<PromptSectionKey>(DEVELOPER_PROMPT_SECTION_KEYS);

function joinSections(sections: BuiltPromptSection[]): string {
  return sections
    .map((section) => `## ${section.title}\n${section.content}`.trim())
    .filter(Boolean)
    .join("\n\n");
}

function mapHistoryRole(role: PromptMessage["role"]): "user" | "assistant" | null {
  if (role === "customer") return "user";
  if (role === "assistant") return "assistant";
  return null;
}

export function resolveUserTurn(input: {
  currentUserMessage?: string;
  recentMessages?: PromptMessage[];
}): {
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const mapped = (input.recentMessages ?? [])
    .map((message) => ({
      role: mapHistoryRole(message.role),
      content: message.content.trim(),
    }))
    .filter(
      (message): message is { role: "user" | "assistant"; content: string } =>
        message.role !== null && message.content.length > 0,
    );

  if (input.currentUserMessage?.trim()) {
    const userMessage = input.currentUserMessage.trim();
    const history = [...mapped];
    const last = history.at(-1);
    if (last?.role === "user" && last.content === userMessage) {
      history.pop();
    }
    return { userMessage, history };
  }

  const history = [...mapped];
  let userMessage = "";
  while (history.length > 0) {
    const last = history.at(-1);
    if (last?.role === "user") {
      userMessage = last.content;
      history.pop();
      break;
    }
    history.pop();
  }

  return { userMessage, history };
}

export function resolveOrchestrationMode(input: {
  mode?: PromptOrchestrationMode;
  templateType?: string;
}): PromptOrchestrationMode {
  if (input.mode) return input.mode;
  if (input.templateType === "conversation" || input.templateType === "fallback") {
    return "conversation";
  }
  return "execution";
}

export function composeMessagePlan(input: {
  mode: PromptOrchestrationMode;
  sections: BuiltPromptSection[];
  outputContract: OutputContract;
  currentUserMessage?: string;
  recentMessages?: PromptMessage[];
  toolsEnabled?: boolean;
}): PromptMessagePlan {
  const systemSections = input.sections.filter((section) => SYSTEM_KEYS.has(section.key));
  const developerSections = input.sections.filter((section) => DEVELOPER_KEYS.has(section.key));

  const { userMessage, history } = resolveUserTurn({
    currentUserMessage: input.currentUserMessage,
    recentMessages: input.recentMessages,
  });

  let developerContent = "";
  if (input.mode === "execution") {
    developerContent = joinSections(developerSections);
  } else if (input.toolsEnabled) {
    developerContent = CONVERSATION_TOOL_DEVELOPER_INSTRUCTIONS;
    const intentSection = developerSections.find((section) => section.key === "intent_decision");
    if (intentSection) {
      developerContent = `${developerContent}\n\n## ${intentSection.title}\n${intentSection.content}`;
    }
  }

  const outputContract =
    input.mode === "execution" && input.outputContract.format === "json"
      ? input.outputContract
      : { format: "text" as const, instructions: "Respond naturally in plain text." };

  return {
    mode: input.mode,
    systemContent: joinSections(systemSections),
    developerContent: developerContent.trim() || undefined,
    history,
    userMessage,
    outputContract,
    toolsEnabled: Boolean(input.toolsEnabled),
  };
}
