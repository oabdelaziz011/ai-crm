import type { OperationsBookingView } from "@/lib/scheduling/operations/types";
import type { OperationsBookingRecord, OperationsRepository } from "@/lib/scheduling/operations/repositories";
import { downloadCsv } from "@/lib/billing/export-csv";
import { mapRecordToOperationsBooking } from "@/lib/scheduling/operations/selectors";

export class OperationsExportService {
  constructor(private readonly repository: OperationsRepository) {}

  async exportDayBookings(
    params: Parameters<OperationsRepository["fetchBookingsForExport"]>[0],
    timezone: string,
    filename: string,
  ): Promise<void> {
    const records = await this.repository.fetchBookingsForExport(params);
    const bookings = records.map((record) => mapRecordToOperationsBooking(record, timezone));
    this.downloadBookingsCsv(filename, bookings);
  }

  downloadBookingsCsv(filename: string, bookings: OperationsBookingView[]): void {
    const headers = [
      "ID",
      "Date",
      "Start",
      "End",
      "Customer",
      "Phone",
      "Service",
      "Resource",
      "Branch",
      "Status",
      "Duration (min)",
      "Notes",
    ];

    const rows = bookings.map((booking) => [
      booking.id,
      booking.startAt.slice(0, 10),
      booking.displayStart,
      booking.displayEnd,
      booking.customer?.name ?? "",
      booking.customer?.phone ?? "",
      booking.service?.name ?? "",
      booking.resource?.name ?? "",
      booking.branch?.name ?? "",
      booking.status,
      String(booking.durationMinutes),
      booking.notes ?? "",
    ]);

    downloadCsv(filename, headers, rows);
  }
}

export function exportRecordsToCsv(
  filename: string,
  records: OperationsBookingRecord[],
  timezone: string,
): void {
  const bookings = records.map((record) => mapRecordToOperationsBooking(record, timezone));
  const headers = [
    "ID",
    "Date",
    "Start",
    "End",
    "Customer",
    "Phone",
    "Service",
    "Resource",
    "Branch",
    "Status",
    "Duration (min)",
    "Notes",
  ];
  const rows = bookings.map((booking) => [
    booking.id,
    booking.startAt.slice(0, 10),
    booking.displayStart,
    booking.displayEnd,
    booking.customer?.name ?? "",
    booking.customer?.phone ?? "",
    booking.service?.name ?? "",
    booking.resource?.name ?? "",
    booking.branch?.name ?? "",
    booking.status,
    String(booking.durationMinutes),
    booking.notes ?? "",
  ]);
  downloadCsv(filename, headers, rows);
}
