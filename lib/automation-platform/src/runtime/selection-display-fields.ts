function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPriceCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Format stored price_cents for customer-facing templates (`{{selected_resource.price_display}}`). */
export function formatLookupPriceDisplay(priceCents: unknown): string | null {
  const cents = readPriceCents(priceCents);
  if (cents == null || cents <= 0) return null;
  const amount = cents / 100;
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(2);
}

export function withServicePriceFields(
  record: Record<string, unknown>,
  service: { price_cents?: unknown; currency?: unknown; price_display?: unknown } | null,
): Record<string, unknown> {
  if (!service) return record;
  const priceDisplay =
    readTrimmedString(service.price_display) ?? formatLookupPriceDisplay(service.price_cents);
  if (!priceDisplay) return record;
  return {
    ...record,
    price_cents: service.price_cents ?? record.price_cents,
    currency: service.currency ?? record.currency,
    price_display: priceDisplay,
  };
}

/**
 * Fill display aliases used by published clinic flows:
 * `{{selected_resource.name}}` and `{{selected_resource.price_display}}`.
 * Consultation fee lives on the selected service, not the doctor row.
 */
export function withSelectionDisplayVariables(
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const service = asRecord(variables.selected_service);
  const resource = asRecord(variables.selected_resource);
  if (!service && !resource) return variables;

  const servicePriceDisplay =
    (service ? readTrimmedString(service.price_display) : null) ??
    formatLookupPriceDisplay(service?.price_cents);
  const resourcePriceDisplay =
    (resource ? readTrimmedString(resource.price_display) : null) ??
    formatLookupPriceDisplay(resource?.price_cents) ??
    servicePriceDisplay;

  return {
    ...variables,
    ...(service
      ? {
          selected_service: {
            ...service,
            price_display: servicePriceDisplay,
          },
        }
      : {}),
    ...(resource
      ? {
          selected_resource: {
            ...resource,
            name: readTrimmedString(resource.name) ?? readTrimmedString(resource.title),
            price_display: resourcePriceDisplay,
          },
        }
      : {}),
  };
}
