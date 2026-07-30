/** Structured slot record returned by the Available Slots computed lookup. */
export type AvailableSlotRecord = {
  start_at: string;
  end_at: string;
  display_time: string;
  duration_minutes: number;
  service_id: string;
  resource_id: string;
  branch_id: string | null;
  timezone: string;
};

export type AvailableSlotsLookupContext = {
  service_id: string;
  resource_id: string;
  date: string;
};
