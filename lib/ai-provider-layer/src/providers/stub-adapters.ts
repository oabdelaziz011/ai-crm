import { createStubAdapterClass } from "./stub-adapter-base.js";

export const OpenAIAdapter = createStubAdapterClass({
  key: "openai",
  displayName: "OpenAI",
  defaultModel: "gpt-4o-mini",
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      baseUrl: { type: "string" },
      organizationId: { type: "string" },
    },
    required: ["model"],
  },
});

export const ClaudeAdapter = createStubAdapterClass({
  key: "claude",
  displayName: "Claude",
  defaultModel: "claude-3-5-sonnet-latest",
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      apiVersion: { type: "string" },
    },
    required: ["model"],
  },
});

export const GeminiAdapter = createStubAdapterClass({
  key: "gemini",
  displayName: "Gemini",
  defaultModel: "gemini-1.5-flash",
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      projectId: { type: "string" },
    },
    required: ["model"],
  },
});

export const AzureOpenAIAdapter = createStubAdapterClass({
  key: "azure_openai",
  displayName: "Azure OpenAI",
  defaultModel: "gpt-4o-mini",
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      deploymentName: { type: "string" },
      endpoint: { type: "string" },
      apiVersion: { type: "string" },
    },
    required: ["model", "deploymentName", "endpoint"],
  },
});

export function createStubAdapters() {
  return {
    openai: (configuration: Record<string, unknown>) => new OpenAIAdapter(configuration),
    claude: (configuration: Record<string, unknown>) => new ClaudeAdapter(configuration),
    gemini: (configuration: Record<string, unknown>) => new GeminiAdapter(configuration),
    azure_openai: (configuration: Record<string, unknown>) => new AzureOpenAIAdapter(configuration),
  };
}
