import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composePersonName,
  displayProfileName,
  validatePersonNameParts,
} from "./person-name.ts";

describe("person name", () => {
  it("requires first, middle, and last name and rejects whitespace", () => {
    const errors = validatePersonNameParts({
      firstName: "  ",
      middleName: "",
      lastName: "\n",
    });
    assert.equal(errors.firstName, "required");
    assert.equal(errors.middleName, "required");
    assert.equal(errors.lastName, "required");
  });

  it("keeps Arabic characters in the combined display name", () => {
    const name = composePersonName({
      firstName: " أحمد ",
      middleName: "محمد",
      lastName: "علي",
    });
    assert.equal(name, "أحمد محمد علي");
    assert.deepEqual(
      validatePersonNameParts({ firstName: "أحمد", middleName: "محمد", lastName: "علي" }),
      {},
    );
  });

  it("uses full_name when structured parts were never stored", () => {
    assert.equal(displayProfileName({ full_name: "Sara Nabil", first_name: null, middle_name: null, last_name: null }), "Sara Nabil");
    assert.equal(displayProfileName({ full_name: "Legacy User" }), "Legacy User");
  });

  it("prefers stored parts over a different full_name", () => {
    assert.equal(
      displayProfileName({
        first_name: "Omar",
        middle_name: "Ali",
        last_name: "Hassan",
        full_name: "Old Name",
      }),
      "Omar Ali Hassan",
    );
  });
});
