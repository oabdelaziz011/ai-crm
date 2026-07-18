export function enrichProviderConfiguration(
  configuration: Record<string, unknown>,
  companyId: string,
): Record<string, unknown> {
  return {
    ...configuration,
    companyId,
  };
}
