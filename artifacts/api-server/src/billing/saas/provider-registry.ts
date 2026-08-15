import type { SaasPaymentProvider, SaasProviderCode } from "./provider-types.js";
import {
  FawrySaasProvider,
  PaymobSaasProvider,
  SandboxSaasProvider,
  StripeSaasProvider,
} from "./providers.js";

export class SaasPaymentProviderRegistry {
  private readonly providers = new Map<SaasProviderCode, SaasPaymentProvider>();

  register(provider: SaasPaymentProvider): void {
    this.providers.set(provider.code, provider);
  }

  get(code: string): SaasPaymentProvider | null {
    return this.providers.get(code as SaasProviderCode) ?? null;
  }

  list(): SaasProviderCode[] {
    return [...this.providers.keys()];
  }

  static createDefault(): SaasPaymentProviderRegistry {
    const registry = new SaasPaymentProviderRegistry();
    registry.register(new SandboxSaasProvider());
    registry.register(new StripeSaasProvider());
    registry.register(new PaymobSaasProvider());
    registry.register(new FawrySaasProvider());
    return registry;
  }
}

let defaultRegistry: SaasPaymentProviderRegistry | null = null;

export function getSaasPaymentProviderRegistry(): SaasPaymentProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = SaasPaymentProviderRegistry.createDefault();
  }
  return defaultRegistry;
}
