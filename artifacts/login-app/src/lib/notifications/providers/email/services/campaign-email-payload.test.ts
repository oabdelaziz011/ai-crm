import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCampaignEmailRender,
  campaignDetailToEmailHtml,
  parseCampaignEmailAttachmentsFromParams,
} from "./campaign-email-payload.ts";

describe("campaign email payload", () => {
  it("uses campaign title as subject and details as the body", () => {
    const rendered = applyCampaignEmailRender(
      {
        subject: "Notification",
        html: "<p>Notification</p>",
        text: "Notification",
        templateKey: "generic_system",
      },
      {
        source: "marketing_campaign",
        campaignTitle: "Spring sale",
        detail: "20% off\nthis week",
      },
    );
    assert.equal(rendered.subject, "Spring sale");
    assert.equal(rendered.text, "20% off\nthis week");
    assert.equal(rendered.html, campaignDetailToEmailHtml("20% off\nthis week"));
    assert.match(rendered.html, /20% off<br>this week/);
  });

  it("does not rewrite unrelated notification emails", () => {
    const original = {
      subject: "Notification",
      html: "<p>Hello</p>",
      text: "Hello",
      templateKey: "generic_system",
    };
    const rendered = applyCampaignEmailRender(original, {
      campaignTitle: "Should not apply",
      detail: "Hello",
    });
    assert.equal(rendered.subject, "Notification");
    assert.equal(rendered.text, "Hello");
  });

  it("parses only attachments stored under the sending company", () => {
    const attachments = parseCampaignEmailAttachmentsFromParams(
      {
        campaignAttachments: JSON.stringify([
          {
            id: "a1",
            name: "offer.pdf",
            mimeType: "application/pdf",
            fileSize: 12,
            storagePath: "co-1/campaigns/x/content/a1-offer.pdf",
          },
          {
            id: "a2",
            name: "other.pdf",
            mimeType: "application/pdf",
            fileSize: 12,
            storagePath: "co-2/campaigns/x/content/a2-other.pdf",
          },
        ]),
      },
      "co-1",
    );
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.name, "offer.pdf");
    assert.deepEqual(parseCampaignEmailAttachmentsFromParams({ campaignAttachments: "not-json" }, "co-1"), []);
  });

  it("escapes HTML in the campaign body", () => {
    assert.equal(
      campaignDetailToEmailHtml('<img src=x onerror="alert(1)">'),
      "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>",
    );
  });
});
