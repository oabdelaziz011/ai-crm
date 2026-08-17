import assert from "node:assert/strict";
import test from "node:test";
import { buildOutputContractFromSections } from "../src/lib/prompts/output-contract.ts";

test("buildOutputContractFromSections detects json instructions", () => {
  const contract = buildOutputContractFromSections({
    output_contract: {
      enabled: true,
      content: 'Return JSON with shape {"label":"x"}',
    },
  });
  assert.equal(contract.format, "json");
  assert.match(contract.instructions, /JSON/);
});

test("buildOutputContractFromSections defaults to text", () => {
  const contract = buildOutputContractFromSections({
    system_instructions: { enabled: true, content: "Help the customer." },
  });
  assert.equal(contract.format, "text");
  assert.ok(contract.instructions.length > 0);
});
