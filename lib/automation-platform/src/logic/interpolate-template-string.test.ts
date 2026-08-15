import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpolateTemplateString } from "./expression-engine.js";

describe("interpolateTemplateString", () => {
  it("resolves nested booking and selection fields for confirmation copy", () => {
    const text = interpolateTemplateString(
      "تم تأكيد الحجز\nالخدمة: {{booking.service_name}}\nمع: {{booking.resource_name}}\n{{booking.display_date}} · {{booking.display_time}}\nمرجع: {{booking.confirmation_code}}",
      {
        booking: {
          service_name: "عيادة",
          resource_name: "Adam",
          display_date: "الاثنين، 10 أغسطس",
          display_time: "9:00 ص",
          confirmation_code: "ABCDEF12",
        },
      },
    );

    assert.match(text, /عيادة/);
    assert.match(text, /Adam/);
    assert.match(text, /الاثنين، 10 أغسطس/);
    assert.match(text, /9:00 ص/);
    assert.match(text, /ABCDEF12/);
    assert.ok(!text.includes("{{"));
  });

  it("replaces missing tokens with empty strings", () => {
    assert.equal(
      interpolateTemplateString("Hello {{customer.name}}!", { customer: {} }),
      "Hello !",
    );
  });
});
