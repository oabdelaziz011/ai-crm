import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLookupFilters,
  fetchResourcesForLookup,
  readServiceIdLookupFilter,
} from "./lookup-options-service";

const DENTAL_SERVICE = "dd839aed-7b5a-4591-9c82-12aa21b2673b";
const AHMED = {
  id: "3c53ed4e-8f20-4eb6-803f-9c1257d7625d",
  name: "Ahmed Hossam",
  resource_type: "doctor",
  status: "active",
};
const OMAR = {
  id: "66a6c9d8-2f80-44d7-bde0-168ef52c27b9",
  name: "Omar Abdelaziz",
  resource_type: "doctor",
  status: "active",
};

describe("resource lookup service_id filter", () => {
  it("does not drop doctors that lack a service_id column", () => {
    const rows = applyLookupFilters(
      [AHMED, OMAR],
      { status: "active", service_id: DENTAL_SERVICE, resource_type: "doctor" },
    );
    assert.equal(rows.length, 2);
  });

  it("reads a resolved service id and ignores unresolved templates", () => {
    assert.equal(readServiceIdLookupFilter({ service_id: DENTAL_SERVICE }), DENTAL_SERVICE);
    assert.equal(readServiceIdLookupFilter({ service_id: "{{selected_service.id}}" }), null);
    assert.equal(readServiceIdLookupFilter({ status: "active" }), null);
  });

  it("loads doctors from the service capability mapping instead of all resources", async () => {
    let listedAll = false;
    const rows = await fetchResourcesForLookup(
      "company-1",
      { status: "active", service_id: DENTAL_SERVICE, resource_type: "doctor" },
      {
        resources: {
          async list() {
            listedAll = true;
            return [AHMED, OMAR];
          },
        },
        capabilities: {
          async listResourcesForService(serviceId) {
            assert.equal(serviceId, DENTAL_SERVICE);
            return [AHMED];
          },
        },
      },
    );

    assert.equal(listedAll, false);
    assert.deepEqual(rows.map((row) => row.id), [AHMED.id]);
  });
});
