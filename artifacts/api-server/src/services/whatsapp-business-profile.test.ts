import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  WhatsAppBusinessProfileError,
  getWhatsAppBusinessProfile,
  readImageDimensions,
  syncWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfilePicture,
  validateProfilePictureBytes,
  validateWhatsAppBusinessProfileUpdate,
  type WhatsAppBusinessProfileDeps,
} from "./whatsapp-business-profile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function tinyPng(width = 200, height = 200): Buffer {
  // Minimal valid 1x1 PNG, then patch IHDR dimensions for validation tests.
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const copy = Buffer.from(base);
  copy.writeUInt32BE(width, 16);
  copy.writeUInt32BE(height, 20);
  return copy;
}

function mockCredentialsLoader(overrides?: Partial<{
  phoneNumberId: string;
  accessToken: string;
  nullCredentials: boolean;
}>): WhatsAppBusinessProfileDeps["credentialsLoader"] {
  return {
    async loadByCompanyId() {
      if (overrides?.nullCredentials) return null;
      return {
        phoneNumberId: overrides?.phoneNumberId ?? "phone-1",
        accessToken: overrides?.accessToken ?? "token-secret-value",
        verifyToken: "verify",
        apiVersion: "v21.0",
        businessAccountId: "waba-1",
      };
    },
  };
}

describe("whatsapp-business-profile validation", () => {
  it("accepts valid field updates and requires messaging_product whatsapp", () => {
    const payload = validateWhatsAppBusinessProfileUpdate({
      about: "Hello shop",
      address: "1 Road",
      description: "Desc",
      email: "a@b.co",
      websites: ["https://example.com", "https://ig.example"],
      vertical: "RETAIL",
    });
    assert.equal(payload.messaging_product, "whatsapp");
    assert.equal(payload.about, "Hello shop");
    assert.deepEqual(payload.websites, ["https://example.com", "https://ig.example"]);
    assert.equal(payload.vertical, "RETAIL");
  });

  it("rejects overlong about and more than two websites", () => {
    assert.throws(
      () => validateWhatsAppBusinessProfileUpdate({ about: "x".repeat(140) }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_VALIDATION",
    );
    assert.throws(
      () =>
        validateWhatsAppBusinessProfileUpdate({
          websites: ["https://a.com", "https://b.com", "https://c.com"],
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_VALIDATION",
    );
  });

  it("rejects unsupported image mime and oversized images", () => {
    assert.throws(
      () =>
        validateProfilePictureBytes({
          mimeType: "image/gif",
          bytes: tinyPng(),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_IMAGE_UNSUPPORTED",
    );
    assert.throws(
      () =>
        validateProfilePictureBytes({
          mimeType: "image/png",
          bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_IMAGE_TOO_LARGE",
    );
  });

  it("rejects images below minimum dimensions", () => {
    assert.throws(
      () =>
        validateProfilePictureBytes({
          mimeType: "image/png",
          bytes: tinyPng(100, 100),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_IMAGE_DIMENSIONS",
    );
  });

  it("rejects non-square profile pictures", () => {
    assert.throws(
      () =>
        validateProfilePictureBytes({
          mimeType: "image/png",
          bytes: tinyPng(200, 300),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_IMAGE_NOT_SQUARE",
    );
  });

  it("reads PNG dimensions from IHDR", () => {
    const dims = readImageDimensions(tinyPng(640, 640), "image/png");
    assert.deepEqual(dims, { width: 640, height: 640 });
  });
});

describe("whatsapp-business-profile Meta Graph flows", () => {
  it("fetches profile successfully and never echoes access tokens", async () => {
    const calls: string[] = [];
    const deps: WhatsAppBusinessProfileDeps = {
      credentialsLoader: mockCredentialsLoader(),
      nowMs: () => Date.parse("2026-11-14T10:00:00.000Z"),
      fetchFn: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
        assert.match(auth, /^Bearer /);
        assert.doesNotMatch(url, /token-secret-value/);
        if (url.includes("whatsapp_business_profile")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  about: "About",
                  address: "Addr",
                  description: "Desc",
                  email: "biz@example.com",
                  websites: ["https://example.com"],
                  vertical: "RETAIL",
                  profile_picture_url: "https://cdn.example/p.jpg",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            display_phone_number: "+15551234567",
            verified_name: "Demo Biz",
          }),
          { status: 200 },
        );
      },
    };

    const profile = await getWhatsAppBusinessProfile("company-a", deps);
    assert.equal(profile.about, "About");
    assert.equal(profile.phoneNumberId, "phone-1");
    assert.equal(profile.displayPhoneNumber, "+15551234567");
    assert.equal(profile.syncedAt, "2026-11-14T10:00:00.000Z");
    assert.ok(calls.some((c) => c.includes("/phone-1/whatsapp_business_profile")));
  });

  it("updates each field and re-fetches after Meta POST", async () => {
    const postedBox: { value?: Record<string, unknown> } = {};
    const deps: WhatsAppBusinessProfileDeps = {
      credentialsLoader: mockCredentialsLoader(),
      fetchFn: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.includes("whatsapp_business_profile")) {
          postedBox.value = JSON.parse(String(init.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.includes("whatsapp_business_profile")) {
          return new Response(
            JSON.stringify({
              data: [{ about: "Updated", websites: ["https://new.example"], vertical: "HEALTH" }],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ display_phone_number: "+1" }), { status: 200 });
      },
    };

    const profile = await updateWhatsAppBusinessProfile(
      "company-a",
      {
        about: "Updated",
        websites: ["https://new.example"],
        vertical: "HEALTH",
      },
      deps,
    );
    assert.equal(postedBox.value?.messaging_product, "whatsapp");
    assert.equal(postedBox.value?.about, "Updated");
    assert.equal(profile.about, "Updated");
    assert.equal(profile.vertical, "HEALTH");
  });

  it("uploads picture via resumable session + profile_picture_handle (not media id)", async () => {
    const posts: Array<{ url: string; body?: string; headers?: Record<string, string> }> = [];
    const deps: WhatsAppBusinessProfileDeps = {
      credentialsLoader: mockCredentialsLoader(),
      metaAppId: "app-123",
      fetchFn: async (input, init) => {
        const url = String(input);
        const headers = Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
            k.toLowerCase(),
            String(v),
          ]),
        );
        if (url.includes("/app-123/uploads")) {
          posts.push({ url, headers });
          return new Response(JSON.stringify({ id: "upload:session-1" }), { status: 200 });
        }
        if (url.includes("/upload:session-1")) {
          posts.push({ url, headers });
          assert.equal(headers.authorization?.startsWith("OAuth "), true);
          assert.equal(headers.file_offset, "0");
          return new Response(JSON.stringify({ h: "4::HANDLE_ABC" }), { status: 200 });
        }
        if (init?.method === "POST" && url.includes("whatsapp_business_profile")) {
          const body = String(init.body);
          posts.push({ url, body, headers });
          const json = JSON.parse(body) as Record<string, unknown>;
          assert.equal(json.messaging_product, "whatsapp");
          assert.equal(json.profile_picture_handle, "4::HANDLE_ABC");
          assert.equal("media_id" in json, false);
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.includes("whatsapp_business_profile")) {
          return new Response(
            JSON.stringify({
              data: [{ profile_picture_url: "https://cdn.example/new.jpg", about: "x" }],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ display_phone_number: "+1" }), { status: 200 });
      },
    };

    const result = await updateWhatsAppBusinessProfilePicture(
      "company-a",
      { mimeType: "image/png", bytes: tinyPng(200, 200), fileName: "avatar.png" },
      deps,
    );
    assert.equal(result.profilePictureUrl, "https://cdn.example/new.jpg");
    assert.equal(result.profilePictureHandleIssued, true);
    assert.ok(posts.some((p) => p.url.includes("/app-123/uploads")));
    assert.ok(posts.some((p) => p.body?.includes("profile_picture_handle")));
  });

  it("fails clearly when upload session creation fails", async () => {
    const deps: WhatsAppBusinessProfileDeps = {
      credentialsLoader: mockCredentialsLoader(),
      metaAppId: "app-123",
      fetchFn: async () =>
        new Response(JSON.stringify({ error: { message: "session boom", code: 100 } }), {
          status: 400,
        }),
    };
    await assert.rejects(
      () =>
        updateWhatsAppBusinessProfilePicture(
          "company-a",
          { mimeType: "image/png", bytes: tinyPng(200, 200) },
          deps,
        ),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_UPLOAD_SESSION_FAILED",
    );
  });

  it("fails clearly when binary upload fails", async () => {
    let step = 0;
    const deps: WhatsAppBusinessProfileDeps = {
      credentialsLoader: mockCredentialsLoader(),
      metaAppId: "app-123",
      fetchFn: async () => {
        step += 1;
        if (step === 1) {
          return new Response(JSON.stringify({ id: "upload:session-1" }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: "upload boom", code: 100 } }), {
          status: 400,
        });
      },
    };
    await assert.rejects(
      () =>
        updateWhatsAppBusinessProfilePicture(
          "company-a",
          { mimeType: "image/png", bytes: tinyPng(200, 200) },
          deps,
        ),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_UPLOAD_FAILED",
    );
  });

  it("fails when Meta rejects profile picture update after handle is issued", async () => {
    let step = 0;
    const deps: WhatsAppBusinessProfileDeps = {
      credentialsLoader: mockCredentialsLoader(),
      metaAppId: "app-123",
      fetchFn: async (input, init) => {
        const url = String(input);
        step += 1;
        if (url.includes("/uploads")) {
          return new Response(JSON.stringify({ id: "upload:session-1" }), { status: 200 });
        }
        if (url.includes("/upload:")) {
          return new Response(JSON.stringify({ h: "4::HANDLE" }), { status: 200 });
        }
        if (init?.method === "POST" && url.includes("whatsapp_business_profile")) {
          return new Response(JSON.stringify({ error: { message: "pic update fail", code: 100 } }), {
            status: 400,
          });
        }
        return new Response("{}", { status: 200 });
      },
    };
    await assert.rejects(
      () =>
        updateWhatsAppBusinessProfilePicture(
          "company-a",
          { mimeType: "image/png", bytes: tinyPng(200, 200) },
          deps,
        ),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError &&
        err.code === "BP_PICTURE_UPDATE_FAILED",
    );
    assert.ok(step >= 3);
  });

  it("maps network failures to BP_NETWORK without inventing profile data", async () => {
    await assert.rejects(
      () =>
        getWhatsAppBusinessProfile("company-a", {
          credentialsLoader: mockCredentialsLoader(),
          fetchFn: async () => {
            throw new TypeError("fetch failed");
          },
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_NETWORK",
    );
  });

  it("maps invalid/expired token and rate limit errors", async () => {
    await assert.rejects(
      () =>
        getWhatsAppBusinessProfile("company-a", {
          credentialsLoader: mockCredentialsLoader(),
          fetchFn: async () =>
            new Response(JSON.stringify({ error: { message: "Invalid OAuth", code: 190 } }), {
              status: 401,
            }),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_TOKEN_INVALID",
    );

    await assert.rejects(
      () =>
        updateWhatsAppBusinessProfile(
          "company-a",
          { about: "Hi" },
          {
            credentialsLoader: mockCredentialsLoader(),
            fetchFn: async () =>
              new Response(JSON.stringify({ error: { message: "rate", code: 80007 } }), {
                status: 429,
              }),
          },
        ),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_RATE_LIMITED",
    );
  });

  it("maps unsupported connection / Business App modes to BP_UNSUPPORTED_MODE", async () => {
    await assert.rejects(
      () =>
        getWhatsAppBusinessProfile("company-a", {
          credentialsLoader: mockCredentialsLoader(),
          fetchFn: async () =>
            new Response(
              JSON.stringify({
                error: {
                  message: "Business profile is not supported for this WhatsApp Business App number",
                  code: 100,
                  error_subcode: 33,
                },
              }),
              { status: 400 },
            ),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_UNSUPPORTED_MODE",
    );
  });

  it("rejects missing connection and missing phone number id", async () => {
    await assert.rejects(
      () =>
        getWhatsAppBusinessProfile("company-a", {
          credentialsLoader: mockCredentialsLoader({ nullCredentials: true }),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_NOT_CONNECTED",
    );

    await assert.rejects(
      () =>
        getWhatsAppBusinessProfile("company-a", {
          credentialsLoader: mockCredentialsLoader({ phoneNumberId: "" }),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError &&
        err.code === "BP_PHONE_NUMBER_ID_MISSING",
    );
  });

  it("sync rethrows Meta failures without inventing empty profile data", async () => {
    await assert.rejects(
      () =>
        syncWhatsAppBusinessProfile("company-a", {
          credentialsLoader: mockCredentialsLoader(),
          fetchFn: async () =>
            new Response(JSON.stringify({ error: { message: "down", code: 1 } }), { status: 500 }),
        }),
      (err: unknown) =>
        err instanceof WhatsAppBusinessProfileError && err.code === "BP_FETCH_FAILED",
    );
  });

  it("does not log access tokens in thrown messages", async () => {
    try {
      await getWhatsAppBusinessProfile("company-a", {
        credentialsLoader: mockCredentialsLoader({ accessToken: "EAASuperSecretTokenValue" }),
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              error: { message: "bad Bearer EAASuperSecretTokenValue", code: 100 },
            }),
            { status: 400 },
          ),
      });
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof WhatsAppBusinessProfileError);
      assert.doesNotMatch(error.message, /EAASuperSecretTokenValue/);
      assert.match(error.message, /REDACTED|bad/i);
    }
  });

  it("route source keeps webhook routes independent of business profile module", () => {
    const route = readFileSync(join(__dirname, "../routes/whatsapp.ts"), "utf8");
    assert.match(route, /\/whatsapp\/business-profile\/get/);
    assert.match(route, /\/whatsapp\/business-profile\/update/);
    assert.match(route, /\/whatsapp\/business-profile\/picture/);
    assert.match(route, /\/whatsapp\/business-profile\/sync/);
    assert.match(route, /settings\.edit/);
    assert.match(route, /phoneNumberId cannot be supplied by the client/);
    assert.doesNotMatch(route, /\/api\/webhooks\/whatsapp/);
  });
});
