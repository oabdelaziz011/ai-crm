import {
  buildActionVariableScope,
  resolveRequiredFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { normalizeFindCustomerConfig } from "../../crm/find-customer-config.js";
import {
  buildCustomerEntityFields,
  buildEmptyCustomerEntityFields,
  buildLookupVariablePatch,
} from "../../crm/lookup/output-variables.js";
import { buildLookupStateFromStatus } from "../../crm/lookup/build-lookup-state.js";
import type { CustomerServicePort } from "../../ports/customer-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";

function resolveActorUserId(context: ExecutionContext): string {
  const candidates = [
    context.run.metadata?.actorUserId,
    context.session.metadata?.actorUserId,
    context.variables.__actorUserId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

export async function executeFindCustomerAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  customerService: CustomerServicePort,
): Promise<NodeExecutionResult> {
  const normalized = normalizeFindCustomerConfig(config);
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const lookupValue = resolveRequiredFieldBindingAsString(normalized.value, scope, "lookup value");

  const result = await customerService.findCustomer({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    lookupBy: normalized.lookupBy,
    lookupValue,
  });

  const lookupState = buildLookupStateFromStatus(result.status, result.count);
  const lookupPatch = buildLookupVariablePatch(lookupState);

  let entityPatch: { customer: Record<string, unknown> };
  if (result.status === "found") {
    entityPatch = buildCustomerEntityFields({
      exists: true,
      id: result.customer.id,
      name: result.customer.name,
      email: result.customer.email,
      phone: result.customer.phone,
      notes: result.customer.notes,
      tags: null,
      type: null,
      createdAt: result.customer.createdAt,
      updatedAt: result.customer.updatedAt,
    });
  } else {
    entityPatch = buildEmptyCustomerEntityFields();
  }

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      ...lookupPatch,
      ...entityPatch,
    }),
    output: {
      lookupStatus: lookupState.status,
      lookupCount: lookupState.count,
    },
  };
}
