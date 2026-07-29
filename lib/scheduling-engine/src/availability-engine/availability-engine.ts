import type { SupabaseClient } from "@supabase/supabase-js";

import type { AvailabilityContextSnapshot } from "../availability-engine/availability-context";
import { AvailabilityContextLoader } from "../availability-engine/availability-context-loader";
import { AvailabilityResolver } from "../availability-engine/availability-resolver";
import type {
  AvailabilityResolveOptions,
  LocalTimePeriod,
  ResolvedAvailability,
} from "../availability-engine/types";

export class AvailabilityEngine {
  private readonly loader: AvailabilityContextLoader;

  constructor(client: SupabaseClient) {
    this.loader = new AvailabilityContextLoader(client);
  }

  /**
   * Resolve effective working periods for a resource on a date, optionally scoped to a service.
   */
  async resolveAvailability(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: AvailabilityResolveOptions,
  ): Promise<ResolvedAvailability> {
    const snapshot = await this.loader.load(companyId, resourceId, date, serviceId, options ?? {});
    return AvailabilityEngine.fromSnapshot(snapshot);
  }

  async isResourceAvailable(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: AvailabilityResolveOptions,
  ): Promise<boolean> {
    const result = await this.resolveAvailability(
      companyId,
      resourceId,
      serviceId,
      date,
      options,
    );
    return result.available;
  }

  /**
   * Effective working hours without service capability checks (serviceId optional).
   */
  async getEffectiveWorkingHours(
    companyId: string,
    resourceId: string,
    date: string,
    options?: AvailabilityResolveOptions & { serviceId?: string | null },
  ): Promise<ResolvedAvailability> {
    const serviceId = options?.serviceId ?? null;
    const { serviceId: _ignored, ...resolveOptions } = options ?? {};
    const snapshot = await this.loader.load(
      companyId,
      resourceId,
      date,
      serviceId,
      resolveOptions,
    );
    return AvailabilityEngine.fromSnapshot(snapshot);
  }

  /** Pure resolution for tests and preloaded contexts. */
  static fromSnapshot(snapshot: AvailabilityContextSnapshot): ResolvedAvailability {
    return AvailabilityResolver.resolve(snapshot);
  }

  static periodsOnly(result: ResolvedAvailability): LocalTimePeriod[] {
    return result.periods;
  }
}
