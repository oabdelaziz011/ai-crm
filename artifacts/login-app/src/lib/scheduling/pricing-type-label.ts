const PRICING_TYPE_KEYS: Record<string, string> = {
  New: "universalOperations.visitTypes.New",
  FollowUp: "universalOperations.visitTypes.FollowUp",
  "Follow Up": "universalOperations.visitTypes.FollowUp",
  Consultation: "universalOperations.visitTypes.Consultation",
  Emergency: "universalOperations.visitTypes.Emergency",
  VIP: "universalOperations.visitTypes.VIP",
  Unknown: "universalOperations.visitTypes.Unknown",
};

/** Arabic (or active locale) name for a pricing-rule type. Custom types keep their saved label. */
export function pricingTypeLabel(
  translate: (key: string) => string,
  type: { code?: string | null; label?: string | null } | null | undefined,
): string {
  const code = type?.code?.trim() ?? "";
  const label = type?.label?.trim() ?? "";
  const key = PRICING_TYPE_KEYS[code] ?? PRICING_TYPE_KEYS[label];
  if (key) {
    const translated = translate(key);
    if (translated && translated !== key) return translated;
  }
  return label || code;
}
