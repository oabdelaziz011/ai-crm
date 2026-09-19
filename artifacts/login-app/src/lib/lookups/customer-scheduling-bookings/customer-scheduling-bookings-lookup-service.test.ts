import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveInteractiveListSelection } from "@workspace/automation-platform";
import { fetchLookupOptions } from "../lookup-options-service";
import {
  getLookupEntityDefinition,
  getLookupEntityDefinitions,
  isLookupEntityId,
} from "../registry";
import { LOOKUP_ENTITY_IDS } from "../types";
import {
  CUSTOMER_SCHEDULING_BOOKING_TITLE_MAX,
  CUSTOMER_SCHEDULING_BOOKINGS_LIMIT,
  CUSTOMER_SCHEDULING_BOOKINGS_LOOKUP,
} from "./customer-scheduling-booking-types";
import { truncateCustomerSchedulingBookingTitle } from "./map-customer-scheduling-bookings";

const COMPANY_ID = "company-a";
const OTHER_COMPANY_ID = "company-b";
const CUSTOMER_ID = "customer-1";
const OTHER_CUSTOMER_ID = "customer-other";
const SERVICE_ID = "service-1";
const RESOURCE_ID = "resource-1";

const FUTURE_EARLY = "2099-01-01T09:00:00.000Z";
const FUTURE_LATE = "2099-01-02T09:00:00.000Z";
const PAST = "2000-01-01T09:00:00.000Z";

type TableRow = Record<string, unknown>;

function booking(overrides: TableRow): TableRow {
  return {
    id: "booking-default",
    company_id: COMPANY_ID,
    customer_id: CUSTOMER_ID,
    service_id: SERVICE_ID,
    resource_id: RESOURCE_ID,
    start_at: FUTURE_EARLY,
    end_at: "2099-01-01T09:30:00.000Z",
    timezone: "Africa/Cairo",
    status: "pending",
    confirmation_number: "CNF-100",
    deleted_at: null,
    ...overrides,
  };
}

function createMockClient(rows: {
  bookings?: TableRow[];
  services?: TableRow[];
  resources?: TableRow[];
}): SupabaseClient {
  const tables: Record<string, TableRow[]> = {
    scheduling_bookings: rows.bookings ?? [],
    scheduling_services: rows.services ?? [
      { id: SERVICE_ID, company_id: COMPANY_ID, name: "Clinic Visit" },
    ],
    scheduling_resources: rows.resources ?? [
      { id: RESOURCE_ID, company_id: COMPANY_ID, name: "Dr Amany Abdelattif" },
    ],
  };

  function queryTable(table: string) {
    let current = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    const finalize = async () => ({ data: current, error: null });

    builder.select = () => builder;
    builder.eq = (column: string, value: unknown) => {
      current = current.filter((row) => row[column] === value);
      return builder;
    };
    builder.in = (column: string, values: unknown[]) => {
      const allowed = new Set(values.map((value) => String(value)));
      current = current.filter((row) => allowed.has(String(row[column])));
      return builder;
    };
    builder.is = (column: string, value: unknown) => {
      current = current.filter((row) => (row[column] ?? null) === value);
      return builder;
    };
    builder.gte = (column: string, value: unknown) => {
      current = current.filter((row) => String(row[column] ?? "") >= String(value));
      return builder;
    };
    builder.order = (column: string, options?: { ascending?: boolean }) => {
      const ascending = options?.ascending !== false;
      current = [...current].sort((left, right) => {
        const av = String(left[column] ?? "");
        const bv = String(right[column] ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return builder;
    };
    builder.limit = (count: number) => {
      current = current.slice(0, count);
      return builder;
    };
    builder.then = (
      onFulfilled?: ((value: unknown) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => finalize().then(onFulfilled ?? undefined, onRejected ?? undefined);

    return builder;
  }

  return {
    from: (table: string) => queryTable(table),
  } as unknown as SupabaseClient;
}

const lookupConfig = {
  lookup: CUSTOMER_SCHEDULING_BOOKINGS_LOOKUP,
  displayField: "display_label",
  valueField: "id",
  filters: { customer_id: CUSTOMER_ID },
} as const;

async function fetchRows(
  bookings: TableRow[],
  extra?: { companyId?: string; filters?: Record<string, unknown>; client?: SupabaseClient },
) {
  const client =
    extra?.client ??
    createMockClient({
      bookings,
    });
  return fetchLookupOptions(
    extra?.companyId ?? COMPANY_ID,
    {
      ...lookupConfig,
      filters: { ...lookupConfig.filters, ...(extra?.filters ?? {}) },
    },
    client,
  );
}

describe("customer_scheduling_bookings lookup", () => {
  it("A. returns an empty result when customer_id is missing", async () => {
    const rows = await fetchLookupOptions(
      COMPANY_ID,
      { lookup: CUSTOMER_SCHEDULING_BOOKINGS_LOOKUP, displayField: "display_label", valueField: "id", filters: {} },
      createMockClient({
        bookings: [booking({ id: "keep-out" })],
      }),
    );
    assert.deepEqual(rows, []);
  });

  it("B. returns same-company upcoming pending and confirmed appointments", async () => {
    const rows = await fetchRows([
      booking({ id: "pending-1", status: "pending", confirmation_number: "CNF-1" }),
      booking({
        id: "confirmed-1",
        status: "confirmed",
        start_at: FUTURE_LATE,
        end_at: "2099-01-02T09:30:00.000Z",
        confirmation_number: "CNF-2",
      }),
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.id), ["pending-1", "confirmed-1"]);
  });

  it("C. excludes past appointments", async () => {
    const rows = await fetchRows([
      booking({ id: "past-1", start_at: PAST, end_at: "2000-01-01T09:30:00.000Z" }),
      booking({ id: "future-1" }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["future-1"]);
  });

  it("D. excludes cancelled appointments", async () => {
    const rows = await fetchRows([
      booking({ id: "cancelled-1", status: "cancelled" }),
      booking({ id: "ok-1" }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["ok-1"]);
  });

  it("E. excludes completed appointments", async () => {
    const rows = await fetchRows([
      booking({ id: "completed-1", status: "completed" }),
      booking({ id: "ok-1" }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["ok-1"]);
  });

  it("F. excludes rescheduled appointments", async () => {
    const rows = await fetchRows([
      booking({ id: "rescheduled-1", status: "rescheduled" }),
      booking({ id: "ok-1" }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["ok-1"]);
  });

  it("G. excludes checked_in appointments", async () => {
    const rows = await fetchRows([
      booking({ id: "checked-in-1", status: "checked_in" }),
      booking({ id: "ok-1" }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["ok-1"]);
  });

  it("H. excludes in_progress appointments", async () => {
    const rows = await fetchRows([
      booking({ id: "in-progress-1", status: "in_progress" }),
      booking({ id: "ok-1" }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["ok-1"]);
  });

  it("I. sorts multiple appointments by start_at ASC", async () => {
    const rows = await fetchRows([
      booking({ id: "later", start_at: FUTURE_LATE, end_at: "2099-01-02T09:30:00.000Z" }),
      booking({ id: "sooner", start_at: FUTURE_EARLY }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["sooner", "later"]);
  });

  it("J. limits results to 25", async () => {
    const bookings = Array.from({ length: 30 }, (_, index) =>
      booking({
        id: `booking-${String(index + 1).padStart(2, "0")}`,
        start_at: `2099-03-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
        end_at: `2099-03-${String(index + 1).padStart(2, "0")}T09:30:00.000Z`,
      }),
    );
    const rows = await fetchRows(bookings);
    assert.equal(rows.length, CUSTOMER_SCHEDULING_BOOKINGS_LIMIT);
    assert.equal(rows[0]?.id, "booking-01");
    assert.equal(rows[24]?.id, "booking-25");
  });

  it("K. returns zero results for another company's customer id", async () => {
    const rows = await fetchRows(
      [
        booking({
          id: "foreign-1",
          company_id: OTHER_COMPANY_ID,
          customer_id: OTHER_CUSTOMER_ID,
        }),
      ],
      { filters: { customer_id: OTHER_CUSTOMER_ID } },
    );
    assert.deepEqual(rows, []);
  });

  it("does not honor a customer-supplied company_id filter", async () => {
    const rows = await fetchRows(
      [booking({ id: "trusted-1" })],
      { filters: { company_id: OTHER_COMPANY_ID } },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, "trusted-1");
  });

  it("L. returned record contains the scheduling identity fields", async () => {
    const rows = await fetchRows([booking({ id: "shape-1" })]);
    const record = rows[0]?.record ?? {};
    assert.equal(record.id, "shape-1");
    assert.equal(record.customer_id, CUSTOMER_ID);
    assert.equal(record.service_id, SERVICE_ID);
    assert.equal(record.resource_id, RESOURCE_ID);
    assert.equal(record.start_at, FUTURE_EARLY);
    assert.equal(record.end_at, "2099-01-01T09:30:00.000Z");
    assert.equal(record.timezone, "Africa/Cairo");
    assert.equal(record.status, "pending");
    assert.equal(record.confirmation_number, "CNF-100");
  });

  it("M. service/resource display names do not replace IDs", async () => {
    const rows = await fetchRows([booking({ id: "names-1" })]);
    const record = rows[0]?.record ?? {};
    assert.equal(record.service_id, SERVICE_ID);
    assert.equal(record.resource_id, RESOURCE_ID);
    assert.equal(record.service_name, "Clinic Visit");
    assert.equal(record.resource_name, "Dr Amany Abdelattif");
    assert.notEqual(record.service_id, record.service_name);
    assert.notEqual(record.resource_id, record.resource_name);
  });

  it("N. display_label satisfies the Instagram interactive-list title constraint", async () => {
    const rows = await fetchRows([booking({ id: "label-1" })]);
    const record = rows[0]?.record ?? {};
    const label = String(record.display_label ?? "");
    assert.ok(label.length > 0);
    assert.ok(label.length <= CUSTOMER_SCHEDULING_BOOKING_TITLE_MAX);
    assert.equal(rows[0]?.title, label);
    assert.equal(
      truncateCustomerSchedulingBookingTitle("1234567890123456789012345").length,
      CUSTOMER_SCHEDULING_BOOKING_TITLE_MAX,
    );
  });

  it("O. registry resolves customer_scheduling_bookings", () => {
    assert.equal(isLookupEntityId(CUSTOMER_SCHEDULING_BOOKINGS_LOOKUP), true);
    const definition = getLookupEntityDefinition(CUSTOMER_SCHEDULING_BOOKINGS_LOOKUP);
    assert.equal(definition.id, CUSTOMER_SCHEDULING_BOOKINGS_LOOKUP);
    assert.equal(definition.computed, true);
    assert.deepEqual(definition.requiredContext, ["customer_id"]);
    assert.equal(definition.variableName, "selected_booking");
    assert.equal(definition.defaultDisplayField, "display_label");
    assert.equal(definition.defaultValueField, "id");
  });

  it("P. existing lookup entities remain registered unchanged", () => {
    const expected = [
      "services",
      "resources",
      "customers",
      "staff",
      "branches",
      "rooms",
      "tags",
      "available_slots",
      "available_dates",
      "recommended_appointments",
      "customer_scheduling_bookings",
    ];
    assert.deepEqual([...LOOKUP_ENTITY_IDS], expected);
    for (const id of expected) {
      assert.equal(isLookupEntityId(id), true);
      assert.equal(getLookupEntityDefinition(id).id, id);
    }
    const registeredIds = new Set(getLookupEntityDefinitions().map((entry) => entry.id));
    for (const id of expected) {
      assert.equal(registeredIds.has(id), true);
    }
    assert.equal(registeredIds.size, expected.length);
    assert.equal(getLookupEntityDefinition("services").variableName, "selected_service");
    assert.equal(getLookupEntityDefinition("available_dates").requiredContext?.[0], "service_id");
    assert.equal(getLookupEntityDefinition("available_slots").requiredContext?.[2], "date");
    assert.equal(getLookupEntityDefinition("recommended_appointments").computed, true);
  });

  it("stores the full record for a future send_list selected_booking selection", async () => {
    const rows = await fetchRows([booking({ id: "select-1" })]);
    const result = resolveInteractiveListSelection({
      config: { outputVariable: "selected_booking" },
      nodeId: "list-reschedule",
      variables: {},
      replyId: "select-1",
      lookupSections: [
        {
          title: "Options",
          rows: rows.map((row) => ({
            id: row.id,
            title: row.title,
            value: row.value,
            record: row.record,
          })),
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const selected = result.variablePatch.selected_booking as Record<string, unknown>;
    assert.equal(selected.id, "select-1");
    assert.equal(selected.service_id, SERVICE_ID);
    assert.equal(selected.resource_id, RESOURCE_ID);
    assert.equal(selected.start_at, FUTURE_EARLY);
    assert.equal(selected.timezone, "Africa/Cairo");
  });

  it("excludes deleted, archived, no_show, and with_nurse rows", async () => {
    const rows = await fetchRows([
      booking({ id: "deleted-1", deleted_at: "2099-01-01T00:00:00.000Z" }),
      booking({ id: "archived-1", status: "archived" }),
      booking({ id: "no-show-1", status: "no_show" }),
      booking({ id: "with-nurse-1", status: "with_nurse" }),
      booking({ id: "ok-1" }),
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["ok-1"]);
  });
});
