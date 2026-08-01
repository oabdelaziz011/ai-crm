import {
  bookingProvider,
  customerProvider,
  genericProvider,
  paymentProvider,
  ticketProvider,
} from "./built-in-mock-providers";
import { createMockProviderRegistry } from "./mock-provider-registry";

export const defaultMockProviderRegistry = createMockProviderRegistry([
  customerProvider,
  bookingProvider,
  ticketProvider,
  paymentProvider,
  genericProvider,
]);

export function createDefaultMockProviderRegistry() {
  return defaultMockProviderRegistry;
}
