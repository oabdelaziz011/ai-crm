import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  META_OAUTH_PUBLIC_ALL_SENTINEL,
  isCompanyAllowedByMetaOauthAllowlist,
  isCompanyAllowedByMetaOauthAllowlistChain,
  parseMetaOauthCompanyAllowlist,
} from "./meta-oauth-company-allowlist.js";
import {
  isMetaMessengerOauthCompanyAllowed,
  isMetaMessengerOauthEnabled,
} from "./meta-messenger-oauth-flags.js";
import {
  isMetaInstagramLoginCompanyAllowed,
  isMetaInstagramLoginEnabled,
} from "./meta-instagram-login-flags.js";
import { buildMetaMessengerLoginReadiness } from "./meta-messenger-login-oauth.js";
import { buildMetaInstagramLoginReadiness } from "./meta-instagram-login-oauth.js";

const DEMO = "d0000010-0001-4001-8001-000000000001";
const OTHER = "d0000010-0001-4001-8001-000000000002";
const THIRD = "d0000010-0001-4001-8001-000000000003";

const here = dirname(fileURLToPath(import.meta.url));

function withEnv(
  overrides: Record<string, string | undefined>,
  run: () => void,
): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    prev[key] = process.env[key];
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    run();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

describe("meta-oauth-company-allowlist parser", () => {
  it("empty and missing deny all", () => {
    assert.equal(parseMetaOauthCompanyAllowlist("").mode, "deny_all");
    assert.equal(parseMetaOauthCompanyAllowlist("   ").mode, "deny_all");
    assert.equal(parseMetaOauthCompanyAllowlist(undefined).mode, "deny_all");
    assert.equal(parseMetaOauthCompanyAllowlist(null).mode, "deny_all");
    assert.equal(isCompanyAllowedByMetaOauthAllowlist(DEMO, ""), false);
    assert.equal(isCompanyAllowedByMetaOauthAllowlist(DEMO, undefined), false);
  });

  it("explicit UUID allowlist permits only listed companies", () => {
    const parsed = parseMetaOauthCompanyAllowlist(`${DEMO},${OTHER}`);
    assert.equal(parsed.mode, "explicit");
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlist(DEMO, `${DEMO},${OTHER}`),
      true,
    );
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlist(OTHER, `${DEMO},${OTHER}`),
      true,
    );
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlist(THIRD, `${DEMO},${OTHER}`),
      false,
    );
  });

  it("explicit * sentinel is public-all", () => {
    assert.equal(META_OAUTH_PUBLIC_ALL_SENTINEL, "*");
    assert.equal(parseMetaOauthCompanyAllowlist("*").mode, "public_all");
    assert.equal(parseMetaOauthCompanyAllowlist(" * ").mode, "public_all");
    assert.equal(
      parseMetaOauthCompanyAllowlist(`*,${DEMO}`).mode,
      "public_all",
    );
    assert.equal(isCompanyAllowedByMetaOauthAllowlist(DEMO, "*"), true);
    assert.equal(isCompanyAllowedByMetaOauthAllowlist(OTHER, "*"), true);
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlist("not-a-uuid", "*"),
      false,
    );
  });

  it("unrecognized tokens alone do not fail-open", () => {
    assert.equal(parseMetaOauthCompanyAllowlist("all").mode, "deny_all");
    assert.equal(parseMetaOauthCompanyAllowlist("true").mode, "deny_all");
    assert.equal(isCompanyAllowedByMetaOauthAllowlist(DEMO, "all"), false);
  });

  it("chain: dedicated * wins; empty dedicated falls back; empty both deny", () => {
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlistChain(DEMO, "*", ""),
      true,
    );
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlistChain(OTHER, "", "*"),
      true,
    );
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlistChain(DEMO, "", ""),
      false,
    );
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlistChain(DEMO, undefined, undefined),
      false,
    );
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlistChain(OTHER, DEMO, "*"),
      false,
    );
    assert.equal(
      isCompanyAllowedByMetaOauthAllowlistChain(DEMO, DEMO, "*"),
      true,
    );
  });
});

describe("Messenger vs Instagram allowlist independence", () => {
  it("Messenger * does not admit Instagram when IG allowlist empty", () => {
    withEnv(
      {
        META_MESSENGER_OAUTH_ENABLED: "true",
        META_INSTAGRAM_LOGIN_ENABLED: "true",
        META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS: "*",
        META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS: "",
        META_PAGES_OAUTH_ALLOWED_COMPANY_IDS: "",
        META_PAGES_OAUTH_ENABLED: "false",
      },
      () => {
        assert.equal(isMetaMessengerOauthEnabled(), true);
        assert.equal(isMetaInstagramLoginEnabled(), true);
        assert.equal(isMetaMessengerOauthCompanyAllowed(DEMO), true);
        assert.equal(isMetaInstagramLoginCompanyAllowed(DEMO), false);
        assert.equal(
          buildMetaMessengerLoginReadiness(DEMO).companyAllowed,
          true,
        );
        assert.equal(
          buildMetaInstagramLoginReadiness(DEMO).reason,
          "IGL_COMPANY_NOT_ALLOWED",
        );
      },
    );
  });

  it("Instagram * does not admit Messenger when Messenger allowlist empty", () => {
    withEnv(
      {
        META_MESSENGER_OAUTH_ENABLED: "true",
        META_INSTAGRAM_LOGIN_ENABLED: "true",
        META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS: "",
        META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS: "*",
        META_PAGES_OAUTH_ALLOWED_COMPANY_IDS: "",
        META_PAGES_OAUTH_ENABLED: "false",
      },
      () => {
        assert.equal(isMetaMessengerOauthCompanyAllowed(DEMO), false);
        assert.equal(isMetaInstagramLoginCompanyAllowed(DEMO), true);
        assert.equal(
          buildMetaMessengerLoginReadiness(DEMO).reason,
          "MSL_COMPANY_NOT_ALLOWED",
        );
        assert.equal(
          buildMetaInstagramLoginReadiness(DEMO).companyAllowed,
          true,
        );
      },
    );
  });
});

describe("OAuth enablement still gates readiness even with *", () => {
  it("disabled Messenger flag blocks everyone including *", () => {
    withEnv(
      {
        META_MESSENGER_OAUTH_ENABLED: "false",
        META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS: "*",
        META_PAGES_OAUTH_ENABLED: "false",
        META_PAGES_OAUTH_ALLOWED_COMPANY_IDS: "",
      },
      () => {
        assert.equal(isMetaMessengerOauthEnabled(), false);
        // Allowlist alone would admit, but readiness reports disabled.
        assert.equal(isMetaMessengerOauthCompanyAllowed(DEMO), true);
        const readiness = buildMetaMessengerLoginReadiness(DEMO);
        assert.equal(readiness.ready, false);
        assert.equal(readiness.reason, "MSL_DISABLED");
      },
    );
  });

  it("disabled Instagram flag blocks everyone including *", () => {
    withEnv(
      {
        META_INSTAGRAM_LOGIN_ENABLED: "false",
        META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS: "*",
        META_PAGES_OAUTH_ENABLED: "false",
        META_PAGES_OAUTH_ALLOWED_COMPANY_IDS: "",
      },
      () => {
        assert.equal(isMetaInstagramLoginEnabled(), false);
        assert.equal(isMetaInstagramLoginCompanyAllowed(DEMO), true);
        const readiness = buildMetaInstagramLoginReadiness(DEMO);
        assert.equal(readiness.ready, false);
        assert.equal(readiness.reason, "IGL_DISABLED");
      },
    );
  });

  it("missing allowlist denies all while enabled", () => {
    withEnv(
      {
        META_MESSENGER_OAUTH_ENABLED: "true",
        META_INSTAGRAM_LOGIN_ENABLED: "true",
        META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS: undefined,
        META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS: undefined,
        META_PAGES_OAUTH_ALLOWED_COMPANY_IDS: undefined,
        META_PAGES_OAUTH_ENABLED: "false",
      },
      () => {
        assert.equal(isMetaMessengerOauthCompanyAllowed(DEMO), false);
        assert.equal(isMetaInstagramLoginCompanyAllowed(DEMO), false);
        assert.equal(
          buildMetaMessengerLoginReadiness(DEMO).reason,
          "MSL_COMPANY_NOT_ALLOWED",
        );
        assert.equal(
          buildMetaInstagramLoginReadiness(DEMO).reason,
          "IGL_COMPANY_NOT_ALLOWED",
        );
      },
    );
  });

  it("* permits all companies at the allowlist/readiness companyAllowed gate", () => {
    withEnv(
      {
        META_MESSENGER_OAUTH_ENABLED: "true",
        META_INSTAGRAM_LOGIN_ENABLED: "true",
        META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS: "*",
        META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS: "*",
        META_PAGES_OAUTH_ALLOWED_COMPANY_IDS: "",
        META_PAGES_OAUTH_ENABLED: "false",
        META_MESSENGER_OAUTH_APP_ID: "app",
        META_MESSENGER_OAUTH_APP_SECRET: "secret",
        META_INSTAGRAM_LOGIN_APP_ID: "app",
        META_INSTAGRAM_LOGIN_APP_SECRET: "secret",
        META_OAUTH_PUBLIC_API_BASE_URL: "https://api.valueor.org",
      },
      () => {
        for (const id of [DEMO, OTHER, THIRD]) {
          assert.equal(isMetaMessengerOauthCompanyAllowed(id), true);
          assert.equal(isMetaInstagramLoginCompanyAllowed(id), true);
          assert.equal(
            buildMetaMessengerLoginReadiness(id).companyAllowed,
            true,
          );
          assert.equal(
            buildMetaInstagramLoginReadiness(id).companyAllowed,
            true,
          );
        }
      },
    );
  });
});

describe("commercial entitlement remains a separate route gate", () => {
  it("Messenger and Instagram OAuth start/complete routes still assert commercial features", () => {
    const messengerRoute = readFileSync(
      join(here, "../routes/meta-messenger-login-oauth.ts"),
      "utf8",
    );
    const instagramRoute = readFileSync(
      join(here, "../routes/meta-instagram-login-oauth.ts"),
      "utf8",
    );
    assert.match(
      messengerRoute,
      /assertRouteCommercialFeature\(companyId, "facebook_channel"\)/,
    );
    assert.match(
      instagramRoute,
      /assertRouteCommercialFeature\(companyId, "instagram_channel"\)/,
    );
    assert.match(messengerRoute, /\/meta\/messenger-oauth\/start/);
    assert.match(instagramRoute, /\/meta\/instagram-login\/start/);
  });
});

describe("WhatsApp allowlist behavior unchanged", () => {
  it("WhatsApp Embedded Signup flags do not import Meta public-all sentinel", () => {
    const waFlags = readFileSync(
      join(here, "whatsapp-embedded-signup-flags.ts"),
      "utf8",
    );
    assert.doesNotMatch(waFlags, /meta-oauth-company-allowlist/);
    assert.doesNotMatch(waFlags, /META_OAUTH_PUBLIC_ALL_SENTINEL/);
    assert.doesNotMatch(waFlags, /META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS/);
  });
});
