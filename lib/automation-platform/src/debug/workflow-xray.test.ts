import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runWithWorkflowXRay,
  setWorkflowXRay,
  WorkflowXRay,
} from "./workflow-xray.js";
import {
  wxBeginNode,
  wxEndNode,
  wxRecordDependencyConstruction,
  wxRecordQuery,
  wxRecordServiceResolution,
} from "./workflow-xray-bridge.js";

describe("WorkflowXRay", () => {
  it("records nodes, queries, duplicates, and constructions within a request scope", async () => {
    const xray = new WorkflowXRay("xray-test-1");
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg?: unknown) => {
      logs.push(String(msg ?? ""));
    };

    try {
      await runWithWorkflowXRay(xray, async () => {
        xray.beginWorkflow({ flowId: "flow-1" });
        const token = wxBeginNode({ id: "n1", name: "Doctors", type: "send_list" });
        wxRecordServiceResolution("lookupOptions.fetchListOptions:resources");
        wxRecordDependencyConstruction("createSchedulingServices");
        wxRecordQuery({
          target: "scheduling_resources",
          operation: "select",
          durationMs: 120,
          rowCount: 3,
        });
        wxRecordQuery({
          target: "scheduling_resources",
          operation: "select",
          durationMs: 110,
          rowCount: 3,
        });
        wxEndNode(token);
        xray.endWorkflow();
        xray.printReport();
      });
    } finally {
      console.log = originalLog;
      setWorkflowXRay(null);
    }

    const joined = logs.join("\n");
    assert.match(joined, /\[WORKFLOW X-RAY\]/);
    assert.match(joined, /node id: n1/);
    assert.match(joined, /scheduling_resources/);
    assert.match(joined, /repeated query/);
    assert.match(joined, /createSchedulingServices: 1/);
    assert.match(joined, /Flame-style report/);
    assert.match(joined, /Recommendations/);
  });
});
