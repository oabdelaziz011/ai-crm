import {
  buildAliasGenerationSystemPrompt,
  buildAliasGenerationUserPrompt,
  coerceGeneratedAliases,
  parseAliasGenerationResponse,
} from "@workspace/product-platform";
import { platformAiChatCompletion } from "@/lib/platform-ai/platform-ai-api-client";
import { isLoginAppProductAliasGenerationEnabled } from "@/lib/product-platform/product-alias-generation-flag.js";

export type ProductAliasPreviewInput = {
  companyId: string;
  name: string;
  description?: string;
  productType?: string;
  brand?: string;
  categoryName?: string | null;
};

/** Stable key so we do not re-call AI for the same product copy. */
export function productAliasPreviewKey(input: ProductAliasPreviewInput): string {
  return [
    input.companyId,
    input.name.trim(),
    String(input.description ?? "").trim(),
    String(input.productType ?? "").trim(),
    String(input.brand ?? "").trim(),
    String(input.categoryName ?? "").trim(),
  ].join("\n");
}

export function canPreviewProductAliases(input: Pick<ProductAliasPreviewInput, "name" | "description">): boolean {
  const name = input.name.trim();
  if (name.length < 3) return false;
  const description = String(input.description ?? "").trim();
  // Name alone is enough for a first pass; description improves quality when present.
  return name.length >= 3 || description.length >= 8;
}

/**
 * Generate search-alias preview for the create dialog (before or during save).
 * Uses the same prompts/validation as post-save generation.
 */
export async function generateProductAliasPreview(
  input: ProductAliasPreviewInput,
): Promise<{ aliases: string[]; primaryLanguage: string }> {
  if (!isLoginAppProductAliasGenerationEnabled()) {
    throw new Error("alias_generation_disabled");
  }
  if (!canPreviewProductAliases(input)) {
    throw new Error("alias_preview_insufficient_copy");
  }

  const system = buildAliasGenerationSystemPrompt();
  const user = buildAliasGenerationUserPrompt({
    name: input.name.trim(),
    description: input.description,
    productType: input.productType,
    brand: input.brand,
    categoryName: input.categoryName,
    tags: [],
  });

  const response = await platformAiChatCompletion({
    companyId: input.companyId,
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
  if (!text) throw new Error("empty_ai_output");

  let parsed;
  try {
    parsed = parseAliasGenerationResponse(text);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_output";
    const retry = await platformAiChatCompletion({
      companyId: input.companyId,
      providerKey: "openai",
      useCase: "chat",
      temperature: 0.2,
      maxTokens: 900,
      responseFormat: "json",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${user}\n\nPrevious output was invalid (${code}). Return ONLY valid JSON matching the schema.`,
        },
      ],
    });
    parsed = parseAliasGenerationResponse(String(retry.text ?? "").trim());
  }

  const aliases = coerceGeneratedAliases(parsed.aliases, {
    productName: input.name.trim(),
    maxCount: 20,
  });
  if (aliases.length === 0) throw new Error("empty_aliases");

  return {
    aliases,
    primaryLanguage: parsed.primaryLanguage,
  };
}
