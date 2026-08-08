import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INTERACTIVE_LIST_PAGINATION_VARIABLE } from "./interactive-list-pagination.js";
import { catalogOffersRecords, resolveInteractiveListSelection } from "./interactive-list-selection.js";

describe("interactive list selection restore", () => {
  const slotRecord = {
    start_at: "2026-08-05T10:00:00.000Z",
    end_at: "2026-08-05T10:30:00.000Z",
    display_time: "10:00 AM",
    duration_minutes: 30,
    service_id: "svc-1",
    resource_id: "res-1",
    timezone: "Africa/Cairo",
  };

  const catalogRows = [
    {
      id: slotRecord.start_at,
      title: slotRecord.display_time,
      value: slotRecord.start_at,
      record: slotRecord,
    },
  ];

  it("detects catalogs that offer structured records", () => {
    assert.equal(catalogOffersRecords(catalogRows), true);
    assert.equal(catalogOffersRecords([{ id: "a", title: "A" }]), false);
  });

  it("restores the full slot record from the persisted catalog", () => {
    const result = resolveInteractiveListSelection({
      config: { outputVariable: "selected_slot", saveAs: "selected_slot" },
      nodeId: "node-times",
      variables: {
        [INTERACTIVE_LIST_PAGINATION_VARIABLE]: {
          nodeId: "node-times",
          pageIndex: 0,
          totalPages: 1,
          sectionTitle: "Options",
          rows: catalogRows,
        },
      },
      replyId: slotRecord.start_at,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.variablePatch.selected_slot, slotRecord);
  });

  it("never falls back to a bare reply id when the catalog offered records", () => {
    const result = resolveInteractiveListSelection({
      config: { outputVariable: "selected_slot" },
      nodeId: "node-times",
      variables: {
        [INTERACTIVE_LIST_PAGINATION_VARIABLE]: {
          nodeId: "node-times",
          pageIndex: 0,
          totalPages: 1,
          sectionTitle: "Options",
          rows: catalogRows,
        },
      },
      replyId: "2026-08-05",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.userMessage, /no longer available/i);
    assert.match(result.errorMessage, /full option record/i);
  });

  it("allows scalar values for static lists without records", () => {
    const result = resolveInteractiveListSelection({
      config: {
        outputVariable: "customer_gender",
        sections: [
          {
            title: "Gender",
            rows: [
              { id: "male", title: "Male" },
              { id: "female_id", title: "Female", value: "female" },
            ],
          },
        ],
      },
      nodeId: "node-gender",
      variables: {},
      replyId: "female_id",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.variablePatch.customer_gender, "female");
  });
});
