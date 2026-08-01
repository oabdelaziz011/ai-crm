import type { MockDataPreset } from "../types/testing-types";
import { createDefaultMockProviderRegistry } from "./mock/register-built-in-mock-providers";
import type { MockProviderRegistry } from "./mock/mock-provider-registry";

export class MockDataProviderService {
  constructor(private readonly registry: MockProviderRegistry = createDefaultMockProviderRegistry()) {}

  listPresets() {
    return this.registry.list();
  }

  buildVariables(
    base: Record<string, unknown> = {},
    presets: MockDataPreset[] = [],
    customPayload: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...base };

    for (const preset of presets) {
      const provider = this.registry.get(preset);
      if (provider) {
        Object.assign(merged, provider.variables);
      }
    }

    if (Object.keys(customPayload).length > 0) {
      Object.assign(merged, customPayload);
    }

    return merged;
  }

  mergeTestCaseVariables(testCase: { mockVariables: Record<string, unknown> }): Record<string, unknown> {
    return { ...testCase.mockVariables };
  }
}

const defaultService = new MockDataProviderService();

export function listMockDataPresets() {
  return defaultService.listPresets();
}

export function buildMockVariables(
  base: Record<string, unknown> = {},
  presets: MockDataPreset[] = [],
  customPayload: Record<string, unknown> = {},
): Record<string, unknown> {
  return defaultService.buildVariables(base, presets, customPayload);
}

export function mergeTestCaseMockVariables(testCase: {
  mockVariables: Record<string, unknown>;
}): Record<string, unknown> {
  return defaultService.mergeTestCaseVariables(testCase);
}
