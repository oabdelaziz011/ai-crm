import assert from "node:assert/strict";
import {
  buildGenderSelectOptions,
  genderDisplayLabel,
  normalizeGenderStorageValue,
} from "../src/lib/customer-gender.ts";

const labels = {
  male: "Male",
  female: "Female",
  other: "Other",
  preferNotToSay: "Prefer not to say",
};

assert.equal(normalizeGenderStorageValue("male"), "male");
assert.equal(normalizeGenderStorageValue("female"), "female");
assert.equal(normalizeGenderStorageValue("Male"), "male");
assert.equal(normalizeGenderStorageValue("Female"), "female");
assert.equal(normalizeGenderStorageValue(null), "");
assert.equal(normalizeGenderStorageValue(""), "");

const options = buildGenderSelectOptions(labels);
assert.deepEqual(
  options.map((option) => option.value),
  ["male", "female", "other", "prefer not to say"],
);
assert.equal(options.find((option) => option.value === "male")?.label, "Male");
assert.equal(options.find((option) => option.value === "female")?.label, "Female");

// DB value male → Select value male → display Male
const dbGender = "male";
const selectValue = normalizeGenderStorageValue(dbGender);
assert.equal(selectValue, "male");
assert.equal(genderDisplayLabel(dbGender, labels), "Male");
assert.ok(options.some((option) => option.value === selectValue));

// Edit save preserves lowercase storage values
assert.equal(normalizeGenderStorageValue("female"), "female");

// Legacy capitalized DB rows still render
assert.equal(genderDisplayLabel("Female", labels), "Female");
assert.equal(normalizeGenderStorageValue("Female"), "female");

console.log("customer-gender.test.mts: all assertions passed");
