import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPPORTUNITIES_DEFAULT_NESTED_PATH,
  OPPORTUNITIES_LEGACY_REDIRECT_PATHS,
  OPPORTUNITIES_ROUTE_REGISTRY,
  opportunitiesNavItems,
} from "@/config/opportunities-route-registry";
import {
  buildOpportunityListFilter,
  opportunityCustomerLabel,
  opportunityProductLabel,
} from "./opportunities-table-filters";
import {
  resolveOpportunityTableActions,
  validateLostReason,
} from "./opportunities-table-row-actions";

describe("opportunities default route", () => {
  it("exposes exactly one Opportunities tab and redirects legacy paths", () => {
    assert.equal(OPPORTUNITIES_DEFAULT_NESTED_PATH, "/table");
    assert.equal(OPPORTUNITIES_ROUTE_REGISTRY.length, 1);
    assert.equal(OPPORTUNITIES_ROUTE_REGISTRY[0]?.id, "table");
    assert.equal(OPPORTUNITIES_ROUTE_REGISTRY[0]?.nestedPath, "/table");
    assert.equal(OPPORTUNITIES_ROUTE_REGISTRY[0]?.titleKey, "opportunities.nav.table");
    assert.deepEqual([...OPPORTUNITIES_LEGACY_REDIRECT_PATHS], ["/pipeline", "/timeline"]);
    assert.equal(opportunitiesNavItems().length, 1);
  });
});

describe("buildOpportunityListFilter", () => {
  it("maps search, stage, owner, outcome, and pagination without inventing fields", () => {
    assert.deepEqual(
      buildOpportunityListFilter({
        query: "acme",
        stageId: "stage-1",
        ownerUserId: "user-1",
        outcome: "open",
        limit: 25,
        offset: 20,
        pipelineId: "pipe-1",
      }),
      {
        query: "acme",
        stageId: "stage-1",
        ownerUserId: "user-1",
        outcome: "open",
        limit: 25,
        offset: 20,
        pipelineId: "pipe-1",
      },
    );
  });

  it("omits empty filters and does not add date-range or sort keys", () => {
    const filter = buildOpportunityListFilter({
      query: "  ",
      stageId: "",
      ownerUserId: "",
      outcome: "",
      limit: 25,
      offset: 0,
      pipelineId: "",
    });
    assert.equal("query" in filter, false);
    assert.equal("stageId" in filter, false);
    assert.equal("ownerUserId" in filter, false);
    assert.equal("outcome" in filter, false);
    assert.equal("sort" in filter, false);
    assert.equal("dateFrom" in filter, false);
  });
});

describe("opportunity display fallbacks", () => {
  it("uses localized missing labels instead of inventing customer/product identity", () => {
    assert.equal(
      opportunityCustomerLabel({ companyName: null, primaryContact: null, missingLabel: "Missing customer" }),
      "Missing customer",
    );
    assert.equal(
      opportunityProductLabel({ primaryProductName: null, missingLabel: "Missing product" }),
      "Missing product",
    );
  });
});

describe("opportunity table row actions", () => {
  it("hides unauthorized archive actions; stage edits stay on the inline Select", () => {
    const actions = resolveOpportunityTableActions({
      canView: true,
      canArchive: false,
      canEdit: true,
    });
    assert.ok(actions.some((a) => a.id === "openOpportunity360"));
    assert.ok(!actions.some((a) => a.id === "archive"));
  });

  it("requires a non-empty lost reason for lost stage", () => {
    assert.equal(validateLostReason("  "), "opportunities.table.errors.lostReasonRequired");
    assert.equal(validateLostReason("Budget"), null);
  });
});
