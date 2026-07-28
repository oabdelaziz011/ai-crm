import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  staticBinding,
  variableBinding,
} from "./normalize.js";
import { resolveFieldBinding, resolveFieldBindingAsString } from "./resolver.js";

describe("field binding", () => {
  it("resolves static bindings literally", () => {
    assert.equal(resolveFieldBinding(staticBinding("Consultation"), {}), "Consultation");
  });

  it("resolves variable bindings via resolveFieldValue", () => {
    const scope = {
      doctor_id: "dr_smith",
      selected_service: { id: "svc_1", name: "Consultation", duration_minutes: 30 },
      conversation: { last_button_id: "booking" },
    };
    assert.equal(resolveFieldBindingAsString(variableBinding("doctor_id"), scope), "dr_smith");
    assert.equal(
      resolveFieldBindingAsString(variableBinding("conversation.last_button_id"), scope),
      "booking",
    );
    assert.equal(resolveFieldBindingAsString(variableBinding("selected_service.id"), scope), "svc_1");
    assert.equal(
      resolveFieldBindingAsString(variableBinding("selected_service.duration_minutes"), scope),
      "30",
    );
  });
});
