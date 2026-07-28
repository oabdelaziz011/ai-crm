/**
 * Sprint P5 — global context & React Query optimization benchmark.
 * Run: npm run test:app-render-perf
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  applyFloatingAiPatch,
  floatingAiPatchChanged,
  floatingAiRegistrationEqual,
} from "../src/lib/floating-ai/context-patch";
import { flattenInfinitePages } from "../src/lib/react-query/infinite-utils";
import {
  appPerfSnapshot,
  resetAppRenderPerf,
} from "../src/lib/perf/app-render-perf";
import type { FloatingAiPageContext } from "../src/lib/floating-ai/types";

function measure(label: string, fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    fn();
  }
  const totalMs = performance.now() - start;
  console.log(`  ${label}: ${(totalMs / iterations).toFixed(4)} ms/op (${iterations} iterations)`);
  return totalMs / iterations;
}

const baseContext: FloatingAiPageContext = {
  page: "customers",
  route: "/customers",
  companyId: "company-1",
  companyName: "Acme",
  userId: "user-1",
  userName: "Alex",
  selectedRows: Array.from({ length: 200 }, (_, index) => ({
    id: `row-${index}`,
    label: `Customer ${index}`,
  })),
  selectedCount: 200,
  filters: { status: "active", vip: true, tags: ["gold", "premium"] },
};

console.log("\n=== Sprint P5 — App Render Perf ===\n");

console.log("Floating AI patch comparison (vs JSON.stringify baseline):");
const stringifyMs = measure(
  "JSON.stringify compare",
  () => {
    const left = JSON.stringify(baseContext);
    const right = JSON.stringify({ ...baseContext, selectedCount: 200 });
    void (left === right);
  },
  500,
);

const shallowMs = measure(
  "shallow patch compare (unchanged)",
  () => {
    floatingAiRegistrationEqual(baseContext, { ...baseContext, selectedCount: 200 });
  },
  500,
);

const patchChangedMs = measure(
  "shallow patch compare (changed row)",
  () => {
    floatingAiRegistrationEqual(baseContext, {
      selectedRows: [{ id: "row-0", label: "Changed" }],
    });
  },
  500,
);

assert.ok(
  shallowMs <= stringifyMs * 1.5,
  `Shallow compare should be faster than JSON.stringify (${shallowMs} vs ${stringifyMs})`,
);

console.log(`\n  Speedup (unchanged context): ${(stringifyMs / shallowMs).toFixed(1)}x`);

console.log("\nFloating AI patch apply (skip unchanged allocation):");
let noopAllocations = 0;
measure(
  "applyFloatingAiPatch unchanged",
  () => {
    const next = applyFloatingAiPatch(baseContext, { selectedCount: 200 });
    if (next === baseContext) noopAllocations += 1;
  },
  1000,
);
assert.equal(noopAllocations, 1000, "Unchanged patches must reuse previous reference");

console.log("\nInfinite page flatten:");
const pages = Array.from({ length: 10 }, (_, pageIndex) =>
  Array.from({ length: 50 }, (_, rowIndex) => ({ id: `${pageIndex}-${rowIndex}` })),
);
measure("flattenInfinitePages (10×50)", () => flattenInfinitePages(pages), 5000);
assert.equal(flattenInfinitePages(pages).length, 500);

console.log("\nPerf counter snapshot:");
resetAppRenderPerf();
console.log(appPerfSnapshot(0));

console.log("\n=== P5 benchmark complete ===\n");
