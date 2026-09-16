import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INSTAGRAM_QUICK_REPLY_LIMIT,
  collectInstagramQuickReplyOptions,
  formatInstagramInteractiveOutbound,
  toInstagramQuickReplies,
  truncateInstagramQuickReplyTitle,
} from "./instagram-quick-replies.js";

describe("Instagram quick reply mapping", () => {
  it("collects list rows from the pricing send_list payload", () => {
    const options = collectInstagramQuickReplyOptions({
      kind: "list",
      title: "اختر خدمة",
      body: "اختَر الخيار الأنسب لك.",
      buttonLabel: "عرض الخيارات",
      sections: [
        {
          title: "خدمات",
          rows: [
            { id: "svc-teeth", title: "عياده اسنان" },
            { id: "svc-kids", title: "عياده اطفال" },
            { id: "svc-internal", title: "عياده باطنة" },
          ],
        },
      ],
    });

    assert.deepEqual(options, [
      { id: "svc-teeth", title: "عياده اسنان" },
      { id: "svc-kids", title: "عياده اطفال" },
      { id: "svc-internal", title: "عياده باطنة" },
    ]);
  });

  it("truncates titles to Instagram's 20-character quick reply limit", () => {
    assert.equal(truncateInstagramQuickReplyTitle("عياده اسنان"), "عياده اسنان");
    assert.equal(
      truncateInstagramQuickReplyTitle("1234567890123456789012345").length,
      20,
    );
  });

  it("caps quick replies at 13 and lists overflow options in the body text", () => {
    const rows = Array.from({ length: INSTAGRAM_QUICK_REPLY_LIMIT + 2 }, (_, index) => ({
      id: `opt-${index + 1}`,
      title: `Option ${index + 1}`,
    }));
    const formatted = formatInstagramInteractiveOutbound("igsid-1", "Pick one", {
      kind: "list",
      body: "Pick one",
      title: "Options",
      buttonLabel: "View",
      sections: [{ title: "All", rows }],
    });

    assert.equal(formatted?.payload.message.quick_replies.length, INSTAGRAM_QUICK_REPLY_LIMIT);
    assert.match(formatted?.payload.message.text ?? "", /14\. Option 14/);
    assert.match(formatted?.payload.message.text ?? "", /15\. Option 15/);
    assert.equal(toInstagramQuickReplies(rows).length, INSTAGRAM_QUICK_REPLY_LIMIT);
  });

  it("returns null for plain text so Instagram stays on the text Send API path", () => {
    assert.equal(
      formatInstagramInteractiveOutbound("igsid-1", "hello", { kind: "text", text: "hello" }),
      null,
    );
  });
});
