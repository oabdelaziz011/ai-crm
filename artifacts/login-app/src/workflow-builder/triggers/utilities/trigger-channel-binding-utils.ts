export type ChannelBindingSnapshot = {
  channel: string | null;
  isEnabled: boolean;
};

export function hasChannelBinding(
  bindings: ReadonlyArray<ChannelBindingSnapshot>,
  channel: string | null | undefined,
): boolean {
  if (!channel) return bindings.some((binding) => binding.isEnabled);
  return bindings.some((binding) => binding.isEnabled && binding.channel === channel);
}

export function toValidationChannelBindings(
  bindings: ReadonlyArray<ChannelBindingSnapshot>,
): ReadonlyArray<{ channel: string | null; isEnabled: boolean }> {
  return bindings.map((binding) => ({
    channel: binding.channel,
    isEnabled: binding.isEnabled,
  }));
}
