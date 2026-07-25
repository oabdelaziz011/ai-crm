import type { SupabaseClient } from "@supabase/supabase-js";
import { BookingService } from "../booking-service.js";
import { SupabaseBookingRepository } from "./supabase-booking-repository.js";
import type { FindBookingInput, FindBookingResult } from "../types/find-booking-input.js";
import type { CreateBookingInput, CreateBookingResult } from "../types/create-booking-input.js";
import type { CancelBookingInput, CancelBookingResult, UpdateBookingInput, UpdateBookingResult } from "../types/booking-mutation-input.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import { resolveCompanyActorUserId } from "./create-supabase-customer-service-port.js";

export type SupabaseBookingServicePortOptions = {
  getActorUserId?: () => string | null;
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
};

async function resolveUserId(
  input: { companyId: string; userId?: string },
  options: SupabaseBookingServicePortOptions,
): Promise<string> {
  if (input.userId?.trim()) return input.userId.trim();
  const fromGetter = options.getActorUserId?.();
  if (fromGetter?.trim()) return fromGetter.trim();
  if (options.resolveActorUserIdForCompany) {
    const resolved = await options.resolveActorUserIdForCompany(input.companyId);
    if (resolved?.trim()) return resolved.trim();
  }
  throw new Error("Booking action requires an authenticated owner user.");
}

export function createSupabaseBookingServicePort(
  client: SupabaseClient,
  options: SupabaseBookingServicePortOptions = {},
): BookingServicePort {
  const repository = new SupabaseBookingRepository(client);
  const service = new BookingService(repository);

  return {
    findBooking(input: FindBookingInput): Promise<FindBookingResult> {
      return resolveUserId(input, options).then((userId) => service.findBooking({ ...input, userId }));
    },
    createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      return resolveUserId(input, options).then((userId) => service.createBooking({ ...input, userId }));
    },
    updateBooking(input: UpdateBookingInput): Promise<UpdateBookingResult> {
      return resolveUserId(input, options).then((userId) => service.updateBooking({ ...input, userId }));
    },
    cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult> {
      return resolveUserId(input, options).then((userId) => service.cancelBooking({ ...input, userId }));
    },
  };
}
