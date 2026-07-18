import type { AiAssistantProvider } from "@/lib/types";

/** Maps AI Assistant settings provider enum to ai_provider_definitions.key */
export function assistantProviderToRegistryKey(provider: AiAssistantProvider): string {
  switch (provider) {
    case "anthropic":
      return "claude";
    case "google":
      return "gemini";
    case "azure":
      return "azure_openai";
    case "openai":
    default:
      return "openai";
  }
}

export function registryKeyToAssistantProvider(key: string): AiAssistantProvider {
  switch (key) {
    case "claude":
      return "anthropic";
    case "gemini":
      return "google";
    case "azure_openai":
      return "azure";
    default:
      return "openai";
  }
}
