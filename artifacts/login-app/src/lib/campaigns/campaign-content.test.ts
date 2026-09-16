import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  campaignEmailChannelVariables,
  campaignTextChannelVariables,
  formatCampaignPickerPhone,
  parseCampaignContentDefinition,
  renderCampaignOutboundText,
  serializeCampaignAttachmentsForQueue,
  validateCampaignAttachmentFiles,
} from "./campaign-content.ts";

describe("campaign content definition", () => {
  it("parses title, detail, and safe attachments for the company", () => {
    const parsed = parseCampaignContentDefinition(
      {
        campaignTitle: "  Spring sale  ",
        detail: "  20% off  ",
        attachments: [
          {
            id: "a1",
            name: "offer.pdf",
            mimeType: "application/pdf",
            fileSize: 2048,
            storagePath: "co-1/campaigns/key/content/a1-offer.pdf",
          },
          {
            id: "bad",
            name: "secret.pdf",
            mimeType: "application/pdf",
            fileSize: 10,
            storagePath: "../co-2/secret.pdf",
          },
        ],
      },
      "co-1",
    );
    assert.equal(parsed.campaignTitle, "Spring sale");
    assert.equal(parsed.detail, "20% off");
    assert.equal(parsed.attachments?.length, 1);
    assert.equal(parsed.attachments?.[0]?.name, "offer.pdf");
  });

  it("renders the same customer-facing text WhatsApp/SMS/IG/Messenger send", () => {
    assert.equal(
      renderCampaignOutboundText({ campaignTitle: "Hello", detail: "World" }),
      "Hello\n\nWorld",
    );
    assert.deepEqual(
      campaignTextChannelVariables({
        customerName: "Omar",
        content: { campaignTitle: "Hello", detail: "World" },
      }),
      {
        customerName: "Omar",
        campaignTitle: "Hello",
        detail: "Hello\n\nWorld",
      },
    );
  });

  it("keeps email body as details and serializes attachments for the queue", () => {
    const content = {
      campaignTitle: "Hello",
      detail: "Offer inside",
      attachments: [
        {
          id: "a1",
          name: "offer.pdf",
          mimeType: "application/pdf",
          fileSize: 2048,
          storagePath: "co-1/campaigns/key/content/a1-offer.pdf",
        },
      ],
    };
    const variables = campaignEmailChannelVariables({
      customerName: "Omar",
      content,
      companyId: "co-1",
    });
    assert.equal(variables.campaignTitle, "Hello");
    assert.equal(variables.detail, "Offer inside");
    assert.equal(variables.source, "marketing_campaign");
    assert.match(variables.campaignAttachments ?? "", /offer\.pdf/);
    assert.equal(serializeCampaignAttachmentsForQueue(content.attachments, "co-2"), "");
  });
});

describe("campaign attachment validation", () => {
  it("accepts allowed types within size limits", () => {
    const result = validateCampaignAttachmentFiles([
      { name: "brief.pdf", type: "application/pdf", size: 1200 },
      { name: "shot.png", type: "image/png", size: 800 },
    ]);
    assert.equal(result.ok, true);
  });

  it("rejects executables, unknown types, and oversized batches", () => {
    assert.equal(
      validateCampaignAttachmentFiles([{ name: "payload.exe", type: "application/octet-stream", size: 10 }])
        .ok,
      false,
    );
    assert.equal(
      validateCampaignAttachmentFiles([{ name: "notes.txt", type: "text/plain", size: 10 }]).ok,
      false,
    );
    assert.equal(
      validateCampaignAttachmentFiles([{ name: "huge.pdf", type: "application/pdf", size: 11 * 1024 * 1024 }])
        .ok,
      false,
    );
    assert.equal(
      validateCampaignAttachmentFiles(
        Array.from({ length: 6 }, (_, index) => ({
          name: `file-${index}.pdf`,
          type: "application/pdf",
          size: 10,
        })),
      ).ok,
      false,
    );
  });
});

describe("campaign picker phone display", () => {
  it("shows compact E.164 without spaces so RTL columns stay aligned", () => {
    assert.equal(
      formatCampaignPickerPhone({ phone: "01073727960", phone_e164: "+20 10 73727960" }),
      "+201073727960",
    );
    assert.equal(formatCampaignPickerPhone({ phone: "01012345678", phoneE164: "+201012345678" }), "+201012345678");
    assert.equal(formatCampaignPickerPhone({ phone: " 010 99 ", phone_e164: null }), "01099");
  });
});
