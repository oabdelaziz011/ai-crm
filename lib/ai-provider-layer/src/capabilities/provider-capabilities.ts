export type ProviderCapabilities = {
  supportsChat: boolean;
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  supportsJsonOutput: boolean;
  supportsTextGeneration: boolean;
};

export const DEFAULT_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  supportsChat: false,
  supportsStreaming: false,
  supportsEmbeddings: false,
  supportsVision: false,
  supportsFunctionCalling: false,
  supportsJsonOutput: false,
  supportsTextGeneration: false,
};

export function mergeCapabilities(
  base: ProviderCapabilities,
  patch: Partial<ProviderCapabilities>,
): ProviderCapabilities {
  return { ...base, ...patch };
}
