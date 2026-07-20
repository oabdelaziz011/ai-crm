import type { PromptLibraryTemplateKey } from "../constants.js";
import type { PromptSectionKey } from "../constants.js";
import type { CreatePromptTemplateInput, PromptSectionConfig } from "../types.js";

export type PromptLibraryTemplateDefinition = {
  key: PromptLibraryTemplateKey;
  displayName: string;
  description: string;
  templateType: CreatePromptTemplateInput["templateType"];
  sectionOrder: PromptSectionKey[];
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
};

export const PROMPT_TEMPLATE_LIBRARY: readonly PromptLibraryTemplateDefinition[] = [
  {
    key: "customer_support",
    displayName: "Customer Support",
    description: "Resolve customer questions with company context and safety guardrails.",
    templateType: "conversation",
    sectionOrder: ["system_instructions", "company_policies", "safety_instructions", "conversation_summary", "recent_messages"],
    sections: {
      system_instructions: {
        enabled: true,
        title: "System Prompt",
        content:
          "You are a customer support assistant for {{company.name}}. Help {{customer.name}} with accurate, concise answers.",
      },
      safety_instructions: {
        enabled: true,
        title: "Safety Prompt",
        content: "Never share credentials. Escalate billing disputes to a human agent.",
      },
    },
  },
  {
    key: "booking_assistant",
    displayName: "Booking Assistant",
    description: "Guide customers through appointment booking flows.",
    templateType: "tool_assistance",
    sectionOrder: ["system_instructions", "company_policies", "recent_messages", "output_contract"],
    sections: {
      system_instructions: {
        enabled: true,
        content:
          "Help {{customer.name}} book an appointment on {{booking.date}}. Confirm details before finalizing.",
      },
    },
  },
  {
    key: "faq_assistant",
    displayName: "FAQ Assistant",
    description: "Answer frequently asked questions using company policies.",
    templateType: "conversation",
    sectionOrder: ["system_instructions", "company_policies", "recent_messages"],
    sections: {
      system_instructions: {
        enabled: true,
        content: "Answer FAQ questions for {{company.name}} using approved company policies only.",
      },
    },
  },
  {
    key: "sales_assistant",
    displayName: "Sales Assistant",
    description: "Qualify leads and explain product value.",
    templateType: "conversation",
    sectionOrder: ["system_instructions", "assistant_profile", "recent_messages", "tone"],
    sections: {
      system_instructions: {
        enabled: true,
        content: "You are a sales assistant for {{company.name}}. Focus on value and next steps.",
      },
    },
  },
  {
    key: "lead_qualification",
    displayName: "Lead Qualification",
    description: "Structured lead qualification prompts.",
    templateType: "extraction",
    sectionOrder: ["system_instructions", "output_contract"],
    sections: {
      system_instructions: {
        enabled: true,
        content: "Qualify lead {{customer.name}} ({{customer.phone}}) and extract intent from {{conversation.history}}.",
      },
    },
  },
  {
    key: "appointment_booking",
    displayName: "Appointment Booking",
    description: "Structured appointment booking assistant.",
    templateType: "tool_assistance",
    sectionOrder: ["system_instructions", "recent_messages", "output_contract"],
    sections: {
      system_instructions: {
        enabled: true,
        content: "Schedule appointments for {{customer.name}} on {{booking.date}} at {{booking.time}}.",
      },
    },
  },
  {
    key: "crm_assistant",
    displayName: "CRM Assistant",
    description: "Summarize CRM context and suggest follow-ups.",
    templateType: "summarization",
    sectionOrder: ["system_instructions", "conversation_summary", "recent_messages"],
    sections: {
      system_instructions: {
        enabled: true,
        content: "Summarize CRM activity for {{customer.name}} and suggest next actions.",
      },
    },
  },
  {
    key: "workflow_decision",
    displayName: "Workflow Decision",
    description: "Decision prompts for workflow branching and classification.",
    templateType: "classification",
    sectionOrder: ["system_instructions", "intent_decision", "output_contract"],
    sections: {
      system_instructions: {
        enabled: true,
        title: "Decision Instructions",
        content:
          "Make a structured business decision for {{company.name}}.\n\nInput:\n{{decision.input}}\n\nDecision mode: {{decision.modeLabel}}\n\nPossible outcomes:\n{{decision.options}}\n\nBusiness rules:\n{{decision.rules}}\n\nExamples:\n{{decision.examples}}\n\nMinimum confidence threshold: {{decision.confidenceThreshold}}",
      },
      intent_decision: {
        enabled: true,
        title: "Decision Criteria",
        content:
          "Choose the single best matching outcome label from the configured options. Use only evidence present in the input.",
      },
      output_contract: {
        enabled: true,
        title: "Output Contract",
        content:
          'Return JSON with shape {"label": "outcome_label", "labels": ["outcome_label"], "confidence": 0.0, "score": null, "reasoning": "short explanation", "metadata": {}}.',
      },
    },
  },
  {
    key: "workflow_summarize",
    displayName: "Workflow Summarize",
    description: "Summarize workflow text with configurable style, tone, and length.",
    templateType: "summarization",
    sectionOrder: ["system_instructions", "knowledge_context", "output_contract"],
    sections: {
      system_instructions: {
        enabled: true,
        title: "Summarization Instructions",
        content:
          "Summarize the following input for {{company.name}}.\n\nInput:\n{{summary.input}}\n\nStyle: {{summary.style}}\nTone: {{summary.tone}}\nLanguage: {{summary.language}}\nMaximum length: {{summary.maxLength}} characters\nBullet mode: {{summary.bulletMode}}\nInstructions: {{summary.instructions}}",
      },
      output_contract: {
        enabled: true,
        title: "Output Contract",
        content: "Return only the summary text unless JSON output is requested.",
      },
    },
  },
  {
    key: "workflow_extract",
    displayName: "Workflow Extract",
    description: "Extract structured business data from unstructured workflow input.",
    templateType: "extraction",
    sectionOrder: ["system_instructions", "knowledge_context", "output_contract"],
    sections: {
      system_instructions: {
        enabled: true,
        title: "Extraction Instructions",
        content:
          "Extract structured business data from the input below for {{company.name}}.\n\nInput:\n{{extract.input}}\n\nSchema:\n{{extract.schema}}\n\nBusiness rules:\n{{extract.businessRules}}\n\nOutput instructions:\n{{extract.outputInstructions}}",
      },
      output_contract: {
        enabled: true,
        title: "Output Contract",
        content:
          'Return JSON with shape {"data": {...}, "confidence": {"overall": 0.0, "fields": {}, "warnings": [], "missingValues": [], "correctionHints": []}}.',
      },
    },
  },
] as const;

export function getPromptLibraryTemplate(key: PromptLibraryTemplateKey): PromptLibraryTemplateDefinition | undefined {
  return PROMPT_TEMPLATE_LIBRARY.find((template) => template.key === key);
}

export function listPromptLibraryTemplates(): PromptLibraryTemplateDefinition[] {
  return [...PROMPT_TEMPLATE_LIBRARY];
}
