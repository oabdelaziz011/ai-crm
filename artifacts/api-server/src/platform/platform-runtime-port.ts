import type { PlatformAIUseCase } from "@workspace/platform-ai-provider";
import type { PlatformRuntimeConfigPort } from "@workspace/ai-execution-engine";

export function createPlatformRuntimeConfigPort(
  resolve: (input: {
    companyId: string;
    providerKey: string;
    useCase: PlatformAIUseCase;
  }) => Promise<Record<string, unknown>>,
): PlatformRuntimeConfigPort {
  return {
    async resolve(input) {
      return resolve({
        companyId: input.companyId,
        providerKey: input.providerKey,
        useCase: (input.useCase as PlatformAIUseCase) ?? "chat",
      });
    },
  };
}
