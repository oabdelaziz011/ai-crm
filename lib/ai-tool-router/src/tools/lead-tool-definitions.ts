import type { LlmFunctionToolDefinition } from "../llm-tool-catalog.js";

export const CREATE_LEAD_TOOL_KEY = "create_lead" as const;
export const UPDATE_LEAD_TOOL_KEY = "update_lead" as const;
export const QUALIFY_LEAD_TOOL_KEY = "qualify_lead" as const;
export const CONVERT_LEAD_TOOL_KEY = "convert_lead" as const;
export const ASSIGN_LEAD_TOOL_KEY = "assign_lead" as const;
export const SEARCH_LEAD_TOOL_KEY = "search_lead" as const;
export const MERGE_LEAD_TOOL_KEY = "merge_lead" as const;
export const SCORE_LEAD_TOOL_KEY = "score_lead" as const;
export const SUGGEST_NEXT_ACTION_TOOL_KEY = "suggest_next_action" as const;

export const LEAD_TOOL_KEYS = [
  CREATE_LEAD_TOOL_KEY,
  UPDATE_LEAD_TOOL_KEY,
  QUALIFY_LEAD_TOOL_KEY,
  CONVERT_LEAD_TOOL_KEY,
  ASSIGN_LEAD_TOOL_KEY,
  SEARCH_LEAD_TOOL_KEY,
  MERGE_LEAD_TOOL_KEY,
  SCORE_LEAD_TOOL_KEY,
  SUGGEST_NEXT_ACTION_TOOL_KEY,
] as const;

export const CREATE_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: CREATE_LEAD_TOOL_KEY,
    description: "Create a sales lead for an unknown or prospective contact. Use before customer conversion.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        contactName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        companyName: { type: "string" },
        conversationId: { type: "string" },
        aiSummary: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
};

export const UPDATE_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: UPDATE_LEAD_TOOL_KEY,
    description: "Update lead contact fields or AI summary.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        title: { type: "string" },
        contactName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        aiSummary: { type: "string" },
        score: { type: "number" },
      },
      required: ["leadId"],
      additionalProperties: false,
    },
  },
};

export const QUALIFY_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: QUALIFY_LEAD_TOOL_KEY,
    description: "Mark a lead as qualified with an optional score.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        score: { type: "number" },
      },
      required: ["leadId"],
      additionalProperties: false,
    },
  },
};

export const CONVERT_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: CONVERT_LEAD_TOOL_KEY,
    description: "Convert a qualified lead into a CRM customer, preserving lead history.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
      },
      required: ["leadId"],
      additionalProperties: false,
    },
  },
};

export const ASSIGN_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: ASSIGN_LEAD_TOOL_KEY,
    description: "Assign a lead to a sales agent.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        assigneeUserId: { type: "string" },
        assignmentMethod: { type: "string" },
      },
      required: ["leadId"],
      additionalProperties: false,
    },
  },
};

export const SEARCH_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: SEARCH_LEAD_TOOL_KEY,
    description: "Search leads by name, email, phone, or lifecycle status.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        lifecycleStatus: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
};

export const MERGE_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: MERGE_LEAD_TOOL_KEY,
    description: "Merge duplicate leads into a primary lead record.",
    parameters: {
      type: "object",
      properties: {
        primaryLeadId: { type: "string" },
        duplicateLeadIds: { type: "array", items: { type: "string" } },
      },
      required: ["primaryLeadId", "duplicateLeadIds"],
      additionalProperties: false,
    },
  },
};

export const SCORE_LEAD_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: SCORE_LEAD_TOOL_KEY,
    description: "Update lead score from 0 to 100.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        score: { type: "number" },
      },
      required: ["leadId", "score"],
      additionalProperties: false,
    },
  },
};

export const SUGGEST_NEXT_ACTION_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: SUGGEST_NEXT_ACTION_TOOL_KEY,
    description: "Suggest the next best sales action for a lead based on lifecycle status.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
      },
      required: ["leadId"],
      additionalProperties: false,
    },
  },
};
