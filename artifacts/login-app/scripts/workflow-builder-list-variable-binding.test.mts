import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes.tsx";
import {
  normalizeListNodeConfig,
  validateListVariableBinding,
} from "../src/workflow-builder/core/conversation/list-node-config.ts";
import { getWorkflowNodeDefinition } from "../src/workflow-builder/core/node-registry.ts";

registerBuiltInWorkflowNodes();

describe("list node variable binding", () => {
  it("maps saveAs to engine inputKey", () => {
    const definition = getWorkflowNodeDefinition("list");
    const engineConfig = definition.toEngineConfig({
      title: "Gender",
      body: "Choose",
      buttonLabel: "Options",
      rows: [{ id: "male", title: "Male" }],
      saveAs: "customer_gender",
    });

    assert.equal(engineConfig.inputKey, "customer_gender");
    assert.equal(engineConfig.saveAs, "customer_gender");
    assert.equal(engineConfig.action, "send_list");
  });

  it("omits inputKey when saveAs is empty", () => {
    const definition = getWorkflowNodeDefinition("list");
    const engineConfig = definition.toEngineConfig({
      title: "Gender",
      body: "Choose",
      buttonLabel: "Options",
      rows: [{ id: "male", title: "Male" }],
      saveAs: "",
    });

    assert.equal(engineConfig.inputKey, undefined);
  });

  it("round-trips saveAs through fromEngineConfig", () => {
    const definition = getWorkflowNodeDefinition("list");
    const builderConfig = definition.fromEngineConfig?.("action", {
      builderType: "list",
      action: "send_list",
      title: "Gender",
      body: "Choose",
      buttonLabel: "Options",
      inputKey: "customer_gender",
      sections: [{ title: "Options", rows: [{ id: "male", title: "Male" }] }],
    });

    assert.equal(builderConfig?.saveAs, "customer_gender");
    assert.deepEqual(builderConfig?.rows, [{ id: "male", title: "Male" }]);
  });

  it("validates workflow variable names when binding is configured", () => {
    assert.equal(validateListVariableBinding({ saveAs: "customer_gender" }, "node-1").length, 0);
    assert.equal(validateListVariableBinding({ saveAs: "9invalid" }, "node-1").length, 1);
    assert.equal(validateListVariableBinding({ saveAs: "" }, "node-1").length, 0);
  });

  it("normalizes legacy inputKey into saveAs", () => {
    assert.deepEqual(normalizeListNodeConfig({ inputKey: "customer_gender" }), {
      inputKey: "customer_gender",
      saveAs: "customer_gender",
    });
  });
});
