import { createStubEmbeddingAdapterClass } from "./stub-adapter-base.js";
import { createOpenAIEmbeddingAdapter } from "./openai-embedding-adapter.js";

export { createOpenAIEmbeddingAdapter };

export const AzureOpenAIEmbeddingAdapter = createStubEmbeddingAdapterClass({
  key: "azure_openai",
  displayName: "Azure OpenAI Embeddings",
  defaultModel: "text-embedding-3-small",
  defaultDimensions: 1536,
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      deploymentName: { type: "string" },
      endpoint: { type: "string" },
      apiVersion: { type: "string" },
      dimensions: { type: "number" },
    },
    required: ["model", "deploymentName", "endpoint"],
  },
});

export const GeminiEmbeddingAdapter = createStubEmbeddingAdapterClass({
  key: "gemini",
  displayName: "Gemini Embeddings",
  defaultModel: "text-embedding-004",
  defaultDimensions: 768,
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      projectId: { type: "string" },
      dimensions: { type: "number" },
    },
    required: ["model"],
  },
});

export const CohereEmbeddingAdapter = createStubEmbeddingAdapterClass({
  key: "cohere",
  displayName: "Cohere Embeddings",
  defaultModel: "embed-english-v3.0",
  defaultDimensions: 1024,
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      dimensions: { type: "number" },
    },
    required: ["model"],
  },
});

export const VoyageEmbeddingAdapter = createStubEmbeddingAdapterClass({
  key: "voyage",
  displayName: "Voyage AI Embeddings",
  defaultModel: "voyage-3",
  defaultDimensions: 1024,
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      dimensions: { type: "number" },
    },
    required: ["model"],
  },
});

export const OllamaEmbeddingAdapter = createStubEmbeddingAdapterClass({
  key: "ollama",
  displayName: "Ollama Embeddings",
  defaultModel: "nomic-embed-text",
  defaultDimensions: 768,
  configurationSchema: {
    type: "object",
    properties: {
      model: { type: "string" },
      baseUrl: { type: "string" },
      dimensions: { type: "number" },
    },
    required: ["model", "baseUrl"],
  },
});

export function createEmbeddingAdapters() {
  return {
    openai: (configuration: Record<string, unknown>) => createOpenAIEmbeddingAdapter(configuration),
    azure_openai: (configuration: Record<string, unknown>) => new AzureOpenAIEmbeddingAdapter(configuration),
    gemini: (configuration: Record<string, unknown>) => new GeminiEmbeddingAdapter(configuration),
    cohere: (configuration: Record<string, unknown>) => new CohereEmbeddingAdapter(configuration),
    voyage: (configuration: Record<string, unknown>) => new VoyageEmbeddingAdapter(configuration),
    ollama: (configuration: Record<string, unknown>) => new OllamaEmbeddingAdapter(configuration),
  };
}

/** @deprecated Use createEmbeddingAdapters */
export const createStubEmbeddingAdapters = createEmbeddingAdapters;
