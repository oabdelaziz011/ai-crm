import {
  buildActionVariableScope,
  resolveRequiredFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { normalizeFindBookingConfig } from "../../crm/find-booking-config.js";
import {
  buildBookingEntityFields,
  buildEmptyBookingEntityFields,
  buildLookupVariablePatch,
} from "../../crm/lookup/output-variables.js";
import { buildLookupStateFromStatus } from "../../crm/lookup/build-lookup-state.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
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

export async function executeFindBookingAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  bookingService: BookingServicePort,
): Promise<NodeExecutionResult> {
  const normalized = normalizeFindBookingConfig(config);
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const lookupValue = resolveRequiredFieldBindingAsString(normalized.value, scope, "lookup value");

  const result = await bookingService.findBooking({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    lookupBy: normalized.lookupBy,
    lookupValue,
  });

  const lookupState = buildLookupStateFromStatus(result.status, result.count);
  const lookupPatch = buildLookupVariablePatch(lookupState);

  let entityPatch: { booking: Record<string, unknown> };
  if (result.status === "found") {
    entityPatch = buildBookingEntityFields({
      exists: true,
      id: result.booking.id,
      customerId: result.booking.customerId,
      service: result.booking.service,
      doctorId: result.booking.doctorId,
      locationId: result.booking.locationId,
      bookingDate: result.booking.bookingDate,
      durationMinutes: result.booking.durationMinutes,
      notes: result.booking.notes,
      status: result.booking.status,
    });
  } else {
    entityPatch = buildEmptyBookingEntityFields();
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
