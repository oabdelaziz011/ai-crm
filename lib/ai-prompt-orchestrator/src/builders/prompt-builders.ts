import type { PromptContextInput, BuilderSectionMap, BuiltPromptSection } from "../types.js";

export interface PromptBuilder {
  build(context: PromptContextInput): BuilderSectionMap;
}

function joinLines(lines: string[]): string {
  return lines.filter((line) => line.trim().length > 0).join("\n");
}

export class SystemPromptBuilder implements PromptBuilder {
  build(context: PromptContextInput): BuilderSectionMap {
    const sections: BuilderSectionMap = {};

    const systemLines = context.systemInstructions ?? [
      "You are a helpful AI assistant operating inside VaultOS.",
      "Follow company policies and respond accurately.",
    ];
    sections.system_instructions = {
      key: "system_instructions",
      title: "System Instructions",
      content: joinLines(systemLines),
    };

    if (context.assistantProfile) {
      const profile = context.assistantProfile;
      sections.assistant_profile = {
        key: "assistant_profile",
        title: "Assistant Profile",
        content: joinLines([
          profile.name ? `Assistant Name: ${profile.name}` : "",
          profile.personality ? `Personality: ${profile.personality}` : "",
          profile.welcome_message ? `Welcome Message: ${profile.welcome_message}` : "",
        ]),
      };
    }

    const safety = context.safetyInstructions ?? [
      "Refuse unsafe requests.",
      "Escalate to a human agent when required.",
    ];
    sections.safety_instructions = {
      key: "safety_instructions",
      title: "Safety Instructions",
      content: joinLines(safety),
    };

    return sections;
  }
}

export class ConversationBuilder implements PromptBuilder {
  build(context: PromptContextInput): BuilderSectionMap {
    const sections: BuilderSectionMap = {};

    if (context.conversationSummary) {
      sections.conversation_summary = {
        key: "conversation_summary",
        title: "Conversation Summary",
        content: context.conversationSummary,
      };
    }

    if (context.recentMessages && context.recentMessages.length > 0) {
      sections.recent_messages = {
        key: "recent_messages",
        title: "Recent Messages",
        content: context.recentMessages
          .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
          .join("\n"),
      };
    }

    if (context.conversationState) {
      sections.conversation_state = {
        key: "conversation_state",
        title: "Conversation State",
        content: `Current conversation state: ${context.conversationState}`,
      };
    }

    return sections;
  }
}

export class ToolResultBuilder implements PromptBuilder {
  build(context: PromptContextInput): BuilderSectionMap {
    const sections: BuilderSectionMap = {};

    if (context.intentDecision) {
      const intent = context.intentDecision;
      sections.intent_decision = {
        key: "intent_decision",
        title: "Intent Decision",
        content: joinLines([
          `Intent: ${intent.intent_key}`,
          `Confidence: ${intent.confidence.toFixed(3)}`,
          intent.matched_tool ? `Matched Tool: ${intent.matched_tool}` : "Matched Tool: none",
          `Reason: ${intent.reason}`,
        ]),
      };
    }

    if (context.toolResults && context.toolResults.length > 0) {
      sections.tool_results = {
        key: "tool_results",
        title: "Executed Tool Results",
        content: context.toolResults
          .map((result) =>
            joinLines([
              `Tool: ${result.tool_key}`,
              `Status: ${result.status}`,
              `Output: ${JSON.stringify(result.output ?? {}, null, 2)}`,
            ]),
          )
          .join("\n\n"),
      };
    }

    return sections;
  }
}

export class PolicyBuilder implements PromptBuilder {
  build(context: PromptContextInput): BuilderSectionMap {
    const sections: BuilderSectionMap = {};

    if (context.companyPolicies && context.companyPolicies.length > 0) {
      sections.company_policies = {
        key: "company_policies",
        title: "Company Policies",
        content: context.companyPolicies.map((policy, index) => `${index + 1}. ${policy}`).join("\n"),
      };
    }

    if (context.language) {
      sections.language = {
        key: "language",
        title: "Language",
        content: `Respond in ${context.language}.`,
      };
    }

    if (context.tone) {
      sections.tone = {
        key: "tone",
        title: "Tone",
        content: `Maintain a ${context.tone} tone.`,
      };
    }

    return sections;
  }
}

export class ResponseContractBuilder implements PromptBuilder {
  build(context: PromptContextInput): BuilderSectionMap {
    void context;
    return {};
  }

  buildOutputContractSection(instructions: string, schema?: Record<string, unknown>): BuiltPromptSection {
    return {
      key: "output_contract",
      title: "Output Contract",
      content: joinLines([
        instructions,
        schema ? `Expected JSON schema:\n${JSON.stringify(schema, null, 2)}` : "",
      ]),
    };
  }

  buildFormattingSection(rules: string[]): BuiltPromptSection {
    return {
      key: "formatting_rules",
      title: "Formatting Rules",
      content: rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n"),
    };
  }
}

export function mergeBuilderSections(builders: PromptBuilder[], context: PromptContextInput): BuilderSectionMap {
  const merged: BuilderSectionMap = {};
  for (const builder of builders) {
    Object.assign(merged, builder.build(context));
  }
  return merged;
}
