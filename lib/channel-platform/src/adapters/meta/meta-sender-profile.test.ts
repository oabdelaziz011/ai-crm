import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMetaSenderProfileToNormalized,
  fetchMetaSenderProfile,
} from "./meta-sender-profile.js";
import type { NormalizedInboundMessageDto } from "../../dto/channel-dto.js";

describe("meta-sender-profile", () => {
  it("fetches Messenger PSID profile name and picture", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      assert.match(url, /graph\.facebook\.com/);
      assert.match(url, /psid-1/);
      assert.match(url, /first_name/);
      return new Response(
        JSON.stringify({
          first_name: "Ada",
          last_name: "Lovelace",
          profile_pic: "https://cdn.example/ada.jpg",
        }),
        { status: 200 },
      );
    };

    const profile = await fetchMetaSenderProfile({
      channelKey: "messenger",
      senderExternalId: "psid-1",
      accessToken: "page-token",
      fetchImpl,
    });
    assert.equal(profile.senderName, "Ada Lovelace");
    assert.equal(profile.profilePicUrl, "https://cdn.example/ada.jpg");
  });

  it("fetches Instagram IGSID profile and no-ops on Graph errors", async () => {
    const ok = await fetchMetaSenderProfile({
      channelKey: "instagram",
      senderExternalId: "igsid-1",
      accessToken: "ig-token",
      fetchImpl: async () =>
        new Response(JSON.stringify({ username: "demo_ig", profile_pic: "https://cdn.example/ig.jpg" }), {
          status: 200,
        }),
    });
    assert.equal(ok.senderName, "demo_ig");
    assert.equal(ok.profilePicUrl, "https://cdn.example/ig.jpg");

    const failed = await fetchMetaSenderProfile({
      channelKey: "instagram",
      senderExternalId: "igsid-1",
      accessToken: "ig-token",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "permission denied" } }), { status: 400 }),
    });
    assert.equal(failed.senderName, null);
    assert.equal(failed.profilePicUrl, null);
  });

  it("merges profile into normalized metadata without overwriting", () => {
    const base: NormalizedInboundMessageDto = {
      externalThreadId: "psid-1",
      externalMessageId: "m1",
      senderExternalId: "psid-1",
      text: "hi",
      attachments: [],
      metadata: { senderName: "Existing" },
    };
    const merged = applyMetaSenderProfileToNormalized(base, "messenger", {
      senderName: "New Name",
      profilePicUrl: "https://cdn.example/pic.jpg",
    });
    assert.equal(merged.metadata?.senderName, "Existing");
    assert.equal(merged.metadata?.messengerProfilePic, "https://cdn.example/pic.jpg");
  });
});
