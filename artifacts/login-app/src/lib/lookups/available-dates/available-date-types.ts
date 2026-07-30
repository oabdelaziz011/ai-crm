export type AvailableDatesLookupContext = {
  service_id: string;
  resource_id: string;
  daysAhead?: number;
};

export type AvailableDateRecord = {
  date: string;
  display_date: string;
  service_id: string;
  resource_id: string;
  timezone: string;
};
