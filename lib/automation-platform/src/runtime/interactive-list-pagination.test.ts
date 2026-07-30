import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveInteractiveListLimits } from "./channel-interactive-list-limits.js";
import {
  applyInteractiveListPaginationToSections,
  buildPaginatedInteractiveListSections,
  computeInteractiveListPagePlan,
  flattenInteractiveListSections,
  INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
  isInteractiveListNextPageReply,
  sliceInteractiveListPageRows,
} from "./interactive-list-pagination.js";
import {
  countWhatsAppInteractiveListRows,
  isWhatsAppInteractiveListPayloadValid,
  validateWhatsAppInteractiveListPayload,
} from "../../../channel-platform/src/adapters/whatsapp/whatsapp-interactive-list-validation.js";

function makeRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row_${index + 1}`,
    title: `Option ${index + 1}`,
    description: `Description ${index + 1}`,
    record: { index: index + 1 },
  }));
}

function toWhatsAppListPayload(sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>) {
  return {
    type: "interactive",
    interactive: {
      type: "list",
      action: { sections },
    },
  };
}

describe("interactive-list-pagination", () => {
  const whatsappLimits = resolveInteractiveListLimits("whatsapp");

  it("computes no pagination for 0-10 rows on WhatsApp", () => {
    for (const count of [0, 1, 10]) {
      const plan = computeInteractiveListPagePlan(count, whatsappLimits);
      assert.equal(plan.requiresPagination, false);
      assert.equal(plan.totalPages, 1);
    }
  });

  it("computes pagination for 11 and 25 rows on WhatsApp", () => {
    assert.deepEqual(computeInteractiveListPagePlan(11, whatsappLimits), {
      totalPages: 2,
      pageSize: 9,
      requiresPagination: true,
    });
    assert.deepEqual(computeInteractiveListPagePlan(25, whatsappLimits), {
      totalPages: 3,
      pageSize: 9,
      requiresPagination: true,
    });
  });

  it("returns one row without navigation for single-row lists", () => {
    const rows = makeRows(1);
    const page = sliceInteractiveListPageRows(rows, 0, whatsappLimits);
    assert.equal(page.length, 1);
    assert.equal(isInteractiveListNextPageReply(page[0]?.id), false);
  });

  it("returns ten rows without navigation for ten-row lists", () => {
    const rows = makeRows(10);
    const page = sliceInteractiveListPageRows(rows, 0, whatsappLimits);
    assert.equal(page.length, 10);
    assert.equal(page.some((row) => row.id === INTERACTIVE_LIST_NEXT_PAGE_ROW_ID), false);
  });

  it("paginates eleven rows into 9 data rows plus Next on page one", () => {
    const rows = makeRows(11);
    const page0 = sliceInteractiveListPageRows(rows, 0, whatsappLimits);
    const page1 = sliceInteractiveListPageRows(rows, 1, whatsappLimits);

    assert.equal(page0.length, 10);
    assert.equal(page0.at(-1)?.id, INTERACTIVE_LIST_NEXT_PAGE_ROW_ID);
    assert.equal(page1.length, 2);
    assert.equal(page1.at(-1)?.id, "row_11");
  });

  it("paginates twenty-five rows across three pages and omits Next on the last page", () => {
    const rows = makeRows(25);
    const pages = [0, 1, 2].map((pageIndex) => sliceInteractiveListPageRows(rows, pageIndex, whatsappLimits));

    assert.equal(pages[0]?.length, 10);
    assert.equal(pages[0]?.at(-1)?.id, INTERACTIVE_LIST_NEXT_PAGE_ROW_ID);
    assert.equal(pages[1]?.length, 10);
    assert.equal(pages[1]?.at(-1)?.id, INTERACTIVE_LIST_NEXT_PAGE_ROW_ID);
    assert.equal(pages[2]?.length, 7);
    assert.equal(pages[2]?.some((row) => row.id === INTERACTIVE_LIST_NEXT_PAGE_ROW_ID), false);
  });

  it("stores pagination state when lookup sections exceed channel limits", () => {
    const sections = [{ title: "Options", rows: makeRows(11) }];
    const result = applyInteractiveListPaginationToSections(sections, {
      nodeId: "node_times",
      limits: whatsappLimits,
      variables: {},
    });

    assert.ok(result.paginationState);
    assert.equal(result.paginationState?.totalPages, 2);
    assert.equal(result.sections[0]?.rows.length, 10);
    assert.equal(result.sections[0]?.rows.at(-1)?.id, INTERACTIVE_LIST_NEXT_PAGE_ROW_ID);
  });

  it("preserves full row catalog in pagination state for later selection resolution", () => {
    const sections = [{ title: "Options", rows: makeRows(11) }];
    const { paginationState } = applyInteractiveListPaginationToSections(sections, {
      nodeId: "node_times",
      limits: whatsappLimits,
      variables: {},
    });

    assert.equal(paginationState?.rows.length, 11);
    assert.equal(paginationState?.rows[10]?.id, "row_11");
  });

  it("validates every paginated WhatsApp page against Meta row limits", () => {
    const rows = makeRows(25);
    const plan = computeInteractiveListPagePlan(rows.length, whatsappLimits);

    for (let pageIndex = 0; pageIndex < plan.totalPages; pageIndex += 1) {
      const sections = buildPaginatedInteractiveListSections(rows, pageIndex, whatsappLimits, "Options");
      const payload = toWhatsAppListPayload(sections);
      assert.doesNotThrow(() => validateWhatsAppInteractiveListPayload(payload));
      assert.equal(isWhatsAppInteractiveListPayloadValid(payload), true);
      assert.equal(countWhatsAppInteractiveListRows(payload), sections[0]?.rows.length ?? 0);
      assert.ok((sections[0]?.rows.length ?? 0) <= 10);
    }
  });

  it("detects invalid eleven-row WhatsApp payloads without pagination", () => {
    const payload = toWhatsAppListPayload([{ title: "Options", rows: makeRows(11) }]);
    assert.throws(
      () => validateWhatsAppInteractiveListPayload(payload),
      /exceeds 10 rows/,
    );
  });

  it("flattens multi-section lists before paginating", () => {
    const sections = [
      { title: "Morning", rows: makeRows(6) },
      { title: "Evening", rows: makeRows(6).map((row, index) => ({ ...row, id: `eve_${index + 1}` })) },
    ];
    const flattened = flattenInteractiveListSections(sections);
    assert.equal(flattened.rows.length, 12);
    assert.equal(flattened.sectionTitle, "Morning");
  });
});
