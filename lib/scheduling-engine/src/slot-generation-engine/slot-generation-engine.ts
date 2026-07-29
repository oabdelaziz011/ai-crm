import type { SupabaseClient } from "@supabase/supabase-js";

import type { LocalTimePeriod } from "../availability-engine/types";
import { SlotContextLoader } from "../slot-generation-engine/slot-context-loader";
import { SlotGenerationResolver } from "../slot-generation-engine/slot-generation-resolver";
import type {
  ExistingBooking,
  ResolvedSlots,
  SlotGenerationOptions,
  SlotGenerationRules,
  SlotGenerationSnapshot,
  SlotStartTime,
} from "../slot-generation-engine/types";

export class SlotGenerationEngine {
  private readonly loader: SlotContextLoader;

  constructor(client: SupabaseClient) {
    this.loader = new SlotContextLoader(client);
  }

  async getAvailableSlots(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: SlotGenerationOptions,
  ): Promise<ResolvedSlots> {
    const snapshot = await this.loader.load(companyId, resourceId, serviceId, date, options);
    return SlotGenerationEngine.fromSnapshot(snapshot);
  }

  async getAvailableSlotsBatch(
    companyId: string,
    resourceIds: string[],
    serviceId: string,
    date: string,
    options?: SlotGenerationOptions,
  ): Promise<ResolvedSlots[]> {
    const snapshots = await this.loader.loadBatch(
      companyId,
      resourceIds,
      serviceId,
      date,
      options,
    );
    return snapshots.map((snapshot) => SlotGenerationEngine.fromSnapshot(snapshot));
  }

  /** Pure resolution for tests and preloaded contexts. */
  static fromSnapshot(snapshot: SlotGenerationSnapshot): ResolvedSlots {
    return SlotGenerationResolver.resolve(snapshot);
  }

  static generateSlots(
    periods: LocalTimePeriod[],
    durationMinutes: number,
    rules: SlotGenerationRules,
  ): SlotStartTime[] {
    return SlotGenerationResolver.generateSlots(periods, durationMinutes, rules);
  }

  static removeBookedSlots(
    slots: SlotStartTime[],
    durationMinutes: number,
    bookings: ExistingBooking[],
    rules: Pick<
      SlotGenerationRules,
      "bufferBeforeMinutes" | "bufferAfterMinutes" | "allowOverbooking"
    >,
  ): SlotStartTime[] {
    return SlotGenerationResolver.removeBookedSlots(
      slots,
      durationMinutes,
      bookings,
      rules,
    );
  }
}
