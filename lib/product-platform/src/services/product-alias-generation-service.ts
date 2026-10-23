/**
 * Background runner for AI product-alias generation.
 * Writes aliases via ProductRepository only (never re-enters command scheduling).
 */

import type { ProductRepository } from "../repositories/product-repository-port.js";
import {
  buildAliasGenerationSystemPrompt,
  buildAliasGenerationUserPrompt,
  mergeProductAliases,
  parseAliasGenerationResponse,
  productAliasContentFingerprint,
  readAliasGenerationMeta,
  withAliasGenerationMeta,
  type ProductAliasAiCompletionPort,
  type ProductAliasGenerationJob,
  type ProductAliasGenerationMeta,
} from "../product-alias-generation.js";

export type ProductAliasGenerationRunResult =
  | { status: "completed"; aliases: string[]; primaryLanguage: string }
  | { status: "skipped_inactive" }
  | { status: "skipped_stale" }
  | { status: "failed"; errorCode: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function completeJsonWithRetry(
  ai: ProductAliasAiCompletionPort,
  input: { companyId: string; system: string; user: string },
): Promise<string> {
  try {
    return await ai.completeJson(input);
  } catch {
    // Transient API restarts / cold starts are common locally — one short retry.
    await delay(900);
    return ai.completeJson(input);
  }
}

async function markGenerationFailed(
  products: ProductRepository,
  job: ProductAliasGenerationJob,
  errorCode: string,
): Promise<void> {
  const product = await products.getProduct(job.companyId, job.productId);
  if (!product || !product.isActive) return;
  if (productAliasContentFingerprint(product) !== job.fingerprint) return;
  const existingMeta = readAliasGenerationMeta(product.metadata);
  if (existingMeta?.requestedAt && existingMeta.requestedAt > job.requestedAt) return;

  const meta: ProductAliasGenerationMeta = {
    status: "failed",
    fingerprint: job.fingerprint,
    requestedAt: job.requestedAt,
    completedAt: new Date().toISOString(),
    errorCode,
    primaryLanguage: existingMeta?.primaryLanguage,
    languages: existingMeta?.languages,
  };

  await products.updateProduct({
    companyId: job.companyId,
    productId: job.productId,
    updatedBy: job.actorUserId,
    metadata: withAliasGenerationMeta(product.metadata, meta),
  });
}

/**
 * Execute one generation job. Safe to call fire-and-forget.
 * Preserves existing aliases; merges validated AI aliases; refuses stale/inactive writes.
 */
export async function executeProductAliasGeneration(input: {
  products: ProductRepository;
  ai: ProductAliasAiCompletionPort;
  job: ProductAliasGenerationJob;
}): Promise<ProductAliasGenerationRunResult> {
  const { products, ai, job } = input;

  const product = await products.getProduct(job.companyId, job.productId);
  if (!product || !product.isActive) {
    return { status: "skipped_inactive" };
  }
  if (productAliasContentFingerprint(product) !== job.fingerprint) {
    return { status: "skipped_stale" };
  }

  let categoryName: string | null = null;
  if (product.categoryId) {
    try {
      const category = await products.getCategory(job.companyId, product.categoryId);
      categoryName = category?.name ?? null;
    } catch {
      categoryName = null;
    }
  }

  const system = buildAliasGenerationSystemPrompt();
  const user = buildAliasGenerationUserPrompt({
    name: product.name,
    description: product.description,
    productType: product.productType,
    brand: product.brand,
    tags: product.tags,
    categoryName,
  });

  let rawText = "";
  try {
    rawText = await completeJsonWithRetry(ai, {
      companyId: job.companyId,
      system,
      user,
    });
  } catch {
    await markGenerationFailed(products, job, "provider_error");
    return { status: "failed", errorCode: "provider_error" };
  }

  let parsed;
  try {
    parsed = parseAliasGenerationResponse(rawText);
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "invalid_output";
    // One salvage retry with a stricter reminder.
    try {
      rawText = await completeJsonWithRetry(ai, {
        companyId: job.companyId,
        system,
        user: `${user}\n\nPrevious output was invalid (${errorCode}). Return ONLY valid JSON matching the schema.`,
      });
      parsed = parseAliasGenerationResponse(rawText);
    } catch (retryError) {
      const retryCode = retryError instanceof Error ? retryError.message : "invalid_output";
      await markGenerationFailed(products, job, retryCode);
      return { status: "failed", errorCode: retryCode };
    }
  }

  const again = await products.getProduct(job.companyId, job.productId);
  if (!again || !again.isActive) {
    return { status: "skipped_inactive" };
  }
  if (productAliasContentFingerprint(again) !== job.fingerprint) {
    return { status: "skipped_stale" };
  }
  const latestMeta = readAliasGenerationMeta(again.metadata);
  if (latestMeta?.requestedAt && latestMeta.requestedAt > job.requestedAt) {
    return { status: "skipped_stale" };
  }

  const merged = mergeProductAliases(again.aliases, parsed.aliases, {
    productName: again.name,
  });

  const meta: ProductAliasGenerationMeta = {
    status: "completed",
    fingerprint: job.fingerprint,
    requestedAt: job.requestedAt,
    completedAt: new Date().toISOString(),
    primaryLanguage: parsed.primaryLanguage,
    languages: parsed.languages,
    generatedCount: parsed.aliases.length,
  };

  await products.updateProduct({
    companyId: job.companyId,
    productId: job.productId,
    updatedBy: job.actorUserId,
    aliases: merged,
    metadata: withAliasGenerationMeta(again.metadata, meta),
  });

  return {
    status: "completed",
    aliases: merged,
    primaryLanguage: parsed.primaryLanguage,
  };
}

export type ProductAliasGenerationSchedulerPort = {
  schedule(job: ProductAliasGenerationJob): void;
};
