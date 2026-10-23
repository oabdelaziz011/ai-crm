import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseProductRepository,
  executeProductAliasGeneration,
  type ProductAliasGenerationJob,
  type ProductAliasGenerationSchedulerPort,
} from "@workspace/product-platform";
import { isLoginAppProductAliasGenerationEnabled } from "@/lib/product-platform/product-alias-generation-flag.js";

/**
 * Fire-and-forget scheduler using the shared platform AI key (via API proxy).
 * Product save never awaits this work.
 */
export function createLoginAppProductAliasGenerationScheduler(
  client: SupabaseClient,
): ProductAliasGenerationSchedulerPort {
  const products = createSupabaseProductRepository(client);
  const inflight = new Set<string>();

  return {
    schedule(job: ProductAliasGenerationJob) {
      try {
        if (!isLoginAppProductAliasGenerationEnabled()) return;
      } catch {
        return;
      }

      const key = `${job.companyId}:${job.productId}:${job.fingerprint}`;
      if (inflight.has(key)) return;
      inflight.add(key);

      void (async () => {
        try {
          const { platformAiChatCompletion } = await import(
            "@/lib/platform-ai/platform-ai-api-client"
          );
          await executeProductAliasGeneration({
            products,
            job,
            ai: {
              async completeJson({ companyId, system, user }) {
                const response = await platformAiChatCompletion({
                  companyId,
                  providerKey: "openai",
                  useCase: "chat",
                  temperature: 0.25,
                  maxTokens: 900,
                  responseFormat: "json",
                  messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                  ],
                });
                const text = String(response.text ?? "").trim();
                if (!text) {
                  throw new Error("empty_ai_output");
                }
                return text;
              },
            },
          });
        } catch (error) {
          console.warn(
            "[product-alias-generation]",
            job.productId,
            error instanceof Error ? error.message : error,
          );
        } finally {
          inflight.delete(key);
        }
      })();
    },
  };
}
