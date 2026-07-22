import { isFieldBinding, staticBinding, variableBinding } from "../field-binding/normalize.js";
import type { CustomerLookupField } from "./lookup/types.js";
import { CUSTOMER_LOOKUP_FIELDS } from "./lookup/types.js";

export type FindCustomerConfig = {
  lookupBy: CustomerLookupField;
  value: unknown;
};

const DEFAULT_LOOKUP_BY: CustomerLookupField = "phone";

export function normalizeFindCustomerConfig(config: Record<string, unknown>): FindCustomerConfig {
  const lookupByRaw = typeof config.lookupBy === "string" ? config.lookupBy.trim() : "";
  const lookupBy = CUSTOMER_LOOKUP_FIELDS.includes(lookupByRaw as CustomerLookupField)
    ? (lookupByRaw as CustomerLookupField)
    : DEFAULT_LOOKUP_BY;

  const value = isFieldBinding(config.value) ? config.value : staticBinding("");

  return { lookupBy, value };
}

export function createDefaultFindCustomerConfig(): FindCustomerConfig {
  return {
    lookupBy: DEFAULT_LOOKUP_BY,
    value: variableBinding("phone"),
  };
}

export { staticBinding, variableBinding };
