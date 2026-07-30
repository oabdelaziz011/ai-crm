import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countWhatsAppInteractiveListRows,
  validateWhatsAppInteractiveListPayload,
} from "./whatsapp-interactive-list-validation.js";

describe("whatsapp-interactive-list-validation", () => {
  it("accepts ten-row list payloads", () => {
    const payload = {
      type: "interactive",
      interactive: {
        type: "list",
        action: {
          sections: [
            {
              title: "Options",
              rows: Array.from({ length: 10 }, (_, index) => ({
                id: `slot_${index}`,
                title: `Slot ${index}`,
              })),
            },
          ],
        },
      },
    };

    assert.doesNotThrow(() => validateWhatsAppInteractiveListPayload(payload));
    assert.equal(countWhatsAppInteractiveListRows(payload), 10);
  });

  it("rejects eleven-row list payloads", () => {
    const payload = {
      type: "interactive",
      interactive: {
        type: "list",
        action: {
          sections: [
            {
              title: "Options",
              rows: Array.from({ length: 11 }, (_, index) => ({
                id: `slot_${index}`,
                title: `Slot ${index}`,
              })),
            },
          ],
        },
      },
    };

    assert.throws(() => validateWhatsAppInteractiveListPayload(payload), /exceeds 10 rows/);
  });
});
