import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDefaultBookingConfirmationText,
  formatBookingConfirmationMessage,
  shouldQueueDefaultBookingConfirmation,
} from "./booking-confirmation-message.js";

describe("shouldQueueDefaultBookingConfirmation", () => {
  it("queues when the next node is follow-up buttons, not a send_message", () => {
    assert.equal(
      shouldQueueDefaultBookingConfirmation({
        currentNodeId: "create-booking",
        nodes: [
          { id: "create-booking", type: "action", config: { action: "create_booking" } },
          {
            id: "follow-up",
            type: "action",
            config: { action: "send_buttons", text: "تحب تسألي عن حاجة تانية، ولا خلاص؟" },
          },
        ],
        edges: [{ source_node_id: "create-booking", target_node_id: "follow-up" }],
      }),
      true,
    );
  });

  it("queues when there is no next node or the next node is end", () => {
    assert.equal(
      shouldQueueDefaultBookingConfirmation({
        currentNodeId: "create-booking",
        nodes: [{ id: "create-booking", type: "action", config: { action: "create_booking" } }],
        edges: [],
      }),
      true,
    );
    assert.equal(
      shouldQueueDefaultBookingConfirmation({
        currentNodeId: "create-booking",
        nodes: [
          { id: "create-booking", type: "action", config: { action: "create_booking" } },
          { id: "end", type: "end", config: {} },
        ],
        edges: [{ source_node_id: "create-booking", target_node_id: "end" }],
      }),
      true,
    );
  });

  it("does not queue when the next node already sends a custom message", () => {
    assert.equal(
      shouldQueueDefaultBookingConfirmation({
        currentNodeId: "create-booking",
        nodes: [
          { id: "create-booking", type: "action", config: { action: "create_booking" } },
          { id: "confirm", type: "action", config: { action: "send_message", text: "تم تأكيد الحجز" } },
        ],
        edges: [{ source_node_id: "create-booking", target_node_id: "confirm" }],
      }),
      false,
    );
  });
});

describe("formatBookingConfirmationMessage", () => {
  it("builds Arabic confirmation with service, doctor, date, time, and number", () => {
    const text = formatBookingConfirmationMessage({
      language: "ar",
      customerName: "نسمة",
      serviceName: "عيادة باطنة",
      resourceName: "Youssef Kamal",
      displayDate: "الثلاثاء، 15 سبتمبر",
      displayTime: "9:15 م",
      confirmationCode: "BK-000042",
    });

    assert.equal(
      text,
      [
        "تم حجز موعدك بنجاح يا نسمة ✅",
        "الخدمة: عيادة باطنة",
        "مع: Youssef Kamal",
        "اليوم: الثلاثاء، 15 سبتمبر",
        "الساعة: 9:15 م",
        "رقم الحجز: BK-000042",
      ].join("\n"),
    );
  });

  it("builds English confirmation from booking variables", () => {
    const text = buildDefaultBookingConfirmationText({
      conversation: { language: "en" },
      booking: {
        customer_name: "Omar",
        service_name: "Clinic Visit",
        resource_name: "Adam",
        display_date: "Sun, Aug 2",
        display_time: "9:15 PM",
        confirmation_code: "BK-000042",
      },
    });

    assert.match(text ?? "", /Your appointment is booked, Omar/);
    assert.match(text ?? "", /Service: Clinic Visit/);
    assert.match(text ?? "", /With: Adam/);
    assert.match(text ?? "", /Booking number: BK-000042/);
  });
});
