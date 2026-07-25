import assert from "node:assert/strict";
import {
  capabilitySelectionSchema,
  serviceFormSchema,
} from "../src/lib/scheduling/validation/service-schemas.ts";

const service = serviceFormSchema.safeParse({
  name: "Dental Cleaning",
  description: "Standard cleaning",
  duration_minutes: 45,
  status: "active",
});
assert.equal(service.success, true, "service form should validate");

const selection = capabilitySelectionSchema.safeParse({
  ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
});
assert.equal(selection.success, true, "capability selection should validate");

const deduped = capabilitySelectionSchema.parse({
  ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000001"],
});
assert.equal(deduped.ids.length, 2, "schema accepts array; service layer dedupes");

console.log("✔ resource capability mapping validation");
