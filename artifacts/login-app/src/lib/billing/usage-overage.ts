/**
 * Overage *preview* math against configured included quantity.
 * Does not invoice or settle. Returns null when usage is unknown.
 */

export type UsageLimitOverride = {
  metric_code: string;
  included_quantity: number | null;
  is_unlimited: boolean;
  overage_allowed: boolean;
  overage_unit_size: number | null;
  overage_unit_price: number | null;
};

export type OveragePreview = {
  metricCode: string;
  usage: number;
  included: number | null;
  overageQuantity: number;
  billableUnits: number;
  charge: number | null;
  unlimited: boolean;
  overageAllowed: boolean;
  chargeable: boolean;
};

export function calculateOveragePreview(input: {
  metricCode: string;
  usage: number | null | undefined;
  override: UsageLimitOverride | null | undefined;
}): OveragePreview | null {
  if (input.usage == null || !Number.isFinite(Number(input.usage))) return null;
  const usage = Number(input.usage);
  const unlimited = Boolean(input.override?.is_unlimited);
  const included = unlimited ? null : input.override?.included_quantity ?? null;
  const overageAllowed = Boolean(input.override?.overage_allowed);
  const unitSize = Number(input.override?.overage_unit_size ?? 0);
  const unitPrice = Number(input.override?.overage_unit_price ?? 0);

  if (unlimited) {
    return {
      metricCode: input.metricCode,
      usage,
      included: null,
      overageQuantity: 0,
      billableUnits: 0,
      charge: 0,
      unlimited: true,
      overageAllowed,
      chargeable: false,
    };
  }

  if (included == null || !Number.isFinite(included)) {
    return {
      metricCode: input.metricCode,
      usage,
      included: null,
      overageQuantity: 0,
      billableUnits: 0,
      charge: null,
      unlimited: false,
      overageAllowed,
      chargeable: false,
    };
  }

  const overageQuantity = Math.max(0, usage - included);
  if (!overageAllowed || overageQuantity <= 0 || unitSize <= 0 || !Number.isFinite(unitPrice)) {
    return {
      metricCode: input.metricCode,
      usage,
      included,
      overageQuantity,
      billableUnits: 0,
      charge: overageAllowed && overageQuantity > 0 ? null : 0,
      unlimited: false,
      overageAllowed,
      chargeable: false,
    };
  }

  const billableUnits = Math.ceil(overageQuantity / unitSize);
  return {
    metricCode: input.metricCode,
    usage,
    included,
    overageQuantity,
    billableUnits,
    charge: billableUnits * unitPrice,
    unlimited: false,
    overageAllowed: true,
    chargeable: true,
  };
}
