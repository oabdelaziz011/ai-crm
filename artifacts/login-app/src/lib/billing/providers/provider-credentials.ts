import type { PaymentProviderCode } from "@/lib/billing/types/financial-enums";
import { readClientEnv } from "@/lib/runtime-env";

export class ProviderNotConfiguredError extends Error {
  constructor(provider: PaymentProviderCode, detail?: string) {
    super(`${provider} provider not configured${detail ? `: ${detail}` : ""}`);
    this.name = "ProviderNotConfiguredError";
  }
}

export type ProviderCredentials = {
  secretKey?: string;
  publicKey?: string;
  merchantId?: string;
  apiKey?: string;
  integrationId?: string;
  iframeId?: string;
};

/**
 * Browser-safe credential loader.
 * Only reads explicitly exposed VITE_* public config; secrets must come from overrides/server APIs.
 */
export function loadProviderCredentials(
  provider: PaymentProviderCode,
  overrides?: Partial<ProviderCredentials>,
): ProviderCredentials {
  const envMap: Record<PaymentProviderCode, ProviderCredentials> = {
    stripe: {
      publicKey: readClientEnv("VITE_STRIPE_PUBLISHABLE_KEY"),
    },
    paymob: {},
    fawry: {},
    sandbox: {},
    manual: {},
  };

  return { ...envMap[provider], ...overrides };
}

export function requireCredential(value: string | undefined, name: string, provider: PaymentProviderCode): string {
  if (!value?.trim()) throw new ProviderNotConfiguredError(provider, `missing ${name}`);
  return value.trim();
}
