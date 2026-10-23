import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWhatsAppChannelMismatch } from "./diagnose-inbox-empty-state.js";

const VALUEOR = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CVP = "d4fdae9a-bb72-4bae-903c-cb4b971d18a8";
const VALUEOR_WHATSAPP = "7392dc11-5875-4c72-8820-4ffea7b99a7b";

describe("resolveWhatsAppChannelMismatch", () => {
  it("does not warn when the open WhatsApp thread belongs to the signed-in company", () => {
    assert.equal(
      resolveWhatsAppChannelMismatch({
        tenantCompanyId: VALUEOR,
        selectedCompanyId: VALUEOR,
        selectedChannel: "whatsapp",
        selectedChannelId: VALUEOR_WHATSAPP,
        companyChannelIds: new Set([VALUEOR_WHATSAPP]),
        channelsResolved: true,
      }),
      false,
    );
  });

  it("does not warn while the company channel list is still unavailable", () => {
    assert.equal(
      resolveWhatsAppChannelMismatch({
        tenantCompanyId: VALUEOR,
        selectedCompanyId: VALUEOR,
        selectedChannel: "whatsapp",
        selectedChannelId: VALUEOR_WHATSAPP,
        companyChannelIds: new Set(),
        channelsResolved: false,
      }),
      false,
    );
  });

  it("warns when the open thread belongs to another company", () => {
    assert.equal(
      resolveWhatsAppChannelMismatch({
        tenantCompanyId: VALUEOR,
        selectedCompanyId: CVP,
        selectedChannel: "whatsapp",
        selectedChannelId: "09371d1f-83e5-4bb5-af98-d4974608cc73",
        companyChannelIds: new Set([VALUEOR_WHATSAPP]),
        channelsResolved: true,
      }),
      true,
    );
  });

  it("warns when a loaded channel list does not contain the thread channel", () => {
    assert.equal(
      resolveWhatsAppChannelMismatch({
        tenantCompanyId: VALUEOR,
        selectedCompanyId: VALUEOR,
        selectedChannel: "whatsapp",
        selectedChannelId: "09371d1f-83e5-4bb5-af98-d4974608cc73",
        companyChannelIds: new Set([VALUEOR_WHATSAPP]),
        channelsResolved: true,
      }),
      true,
    );
  });
});
