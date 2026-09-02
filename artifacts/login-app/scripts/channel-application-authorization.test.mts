/**
 * B1.2 Part 3 — channel application/navigation/API authorization hardening.
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/channel-application-authorization.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  CHANNEL_MANAGEMENT_ENTITLEMENT_CODES,
  isAnyChannelManagementEntitled,
  isChannelManagementUiSupported,
} from "../src/lib/billing/channel-management-entitlement.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");

const dashboardRegistry = readFileSync(
  resolve(here, "../src/config/dashboard-route-registry.ts"),
  "utf8",
);
const dashboardSectionRoute = readFileSync(
  resolve(here, "../src/components/dashboard/dashboard-section-route.tsx"),
  "utf8",
);
const omnichannelRoute = readFileSync(
  resolve(projectRoot, "artifacts/api-server/src/routes/omnichannel.ts"),
  "utf8",
);
const whatsappRoute = readFileSync(
  resolve(projectRoot, "artifacts/api-server/src/routes/whatsapp.ts"),
  "utf8",
);
const emailRoute = readFileSync(
  resolve(projectRoot, "artifacts/api-server/src/routes/email.ts"),
  "utf8",
);
const emailChannelRoute = readFileSync(
  resolve(projectRoot, "artifacts/api-server/src/routes/email-channel.ts"),
  "utf8",
);
const routeCommercialAuth = readFileSync(
  resolve(projectRoot, "artifacts/api-server/src/lib/route-commercial-auth.ts"),
  "utf8",
);
const channelsPage = readFileSync(
  resolve(here, "../src/pages/dashboard/channels/channels-page.tsx"),
  "utf8",
);
const migration343 = readFileSync(
  resolve(projectRoot, "supabase/migrations/343_channel_permission_commercial_mapping.sql"),
  "utf8",
);
const migration344 = readFileSync(
  resolve(projectRoot, "supabase/migrations/344_channel_commercial_rls_hardening.sql"),
  "utf8",
);

function perms(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function entitledLookup(enabled: Record<string, boolean>) {
  return (code: string) => (code in enabled ? enabled[code] : undefined);
}

/** Mirrors isDashboardRoutePermitted for channels + omnichannel routes (no super-admin). */
function evaluateRouteAccess(options: {
  permission?: string;
  hasPermission: (code: string) => boolean;
  commercialFeatureCode?: string;
  requiresAnyChannelEntitlement?: boolean;
  commercialFeatureEnabled: (code: string) => boolean | undefined;
}): boolean {
  if (options.permission && !options.hasPermission(options.permission)) {
    return false;
  }
  if (options.commercialFeatureCode) {
    if (options.commercialFeatureEnabled(options.commercialFeatureCode) !== true) {
      return false;
    }
  }
  if (options.requiresAnyChannelEntitlement) {
    if (!isAnyChannelManagementEntitled(options.commercialFeatureEnabled)) {
      return false;
    }
  }
  return true;
}

describe("Channels dashboard route", () => {
  const channelsRouteDef = {
    permission: "channels.view",
    requiresAnyChannelEntitlement: true as const,
  };

  it("requires any sellable channel entitlement (not omnichannel umbrella)", () => {
    assert.match(dashboardRegistry, /id: "channels"[\s\S]*requiresAnyChannelEntitlement: true/);
    assert.doesNotMatch(
      dashboardRegistry,
      /id: "channels"[\s\S]*commercialFeatureCode: "omnichannel"/,
    );
  });

  it("A no channel entitlement + channels.view → DENY", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: entitledLookup({}),
      }),
      false,
    );
  });

  it("B whatsapp entitlement + channels.view → ALLOW", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: entitledLookup({ whatsapp_channel: true }),
      }),
      true,
    );
  });

  it("C email entitlement + channels.view → ALLOW", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: entitledLookup({ email_channel: true }),
      }),
      true,
    );
  });

  it("D facebook entitlement + channels.view → ALLOW", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: entitledLookup({ facebook_channel: true }),
      }),
      true,
    );
  });

  it("E instagram entitlement + channels.view → ALLOW", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: entitledLookup({ instagram_channel: true }),
      }),
      true,
    );
  });

  it("F omnichannel only → channels DENY; omnichannel console ALLOW", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: entitledLookup({ omnichannel: true }),
      }),
      false,
    );
    assert.equal(
      evaluateRouteAccess({
        permission: "ai.conversations.view",
        commercialFeatureCode: "omnichannel",
        hasPermission: perms("ai.conversations.view"),
        commercialFeatureEnabled: entitledLookup({ omnichannel: true }),
      }),
      true,
    );
  });

  it("G loading/undefined entitlement → DENY", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: () => undefined,
      }),
      false,
    );
  });

  it("H resolver error (false) → DENY", () => {
    assert.equal(
      evaluateRouteAccess({
        ...channelsRouteDef,
        hasPermission: perms("channels.view"),
        commercialFeatureEnabled: () => false,
      }),
      false,
    );
  });

  it("sms-only entitlement does not open channels dashboard", () => {
    assert.equal(
      isAnyChannelManagementEntitled(entitledLookup({ sms_channel: true })),
      false,
    );
  });
});

describe("Helper invariants", () => {
  it("isAnyChannelManagementEntitled fail-closed", () => {
    assert.equal(isAnyChannelManagementEntitled(undefined), false);
    assert.equal(isAnyChannelManagementEntitled(() => undefined), false);
    assert.deepEqual(CHANNEL_MANAGEMENT_ENTITLEMENT_CODES, [
      "whatsapp_channel",
      "facebook_channel",
      "instagram_channel",
      "email_channel",
    ]);
  });

  it("SMS excluded from management UI surfaces", () => {
    assert.equal(isChannelManagementUiSupported("sms"), false);
    assert.equal(isChannelManagementUiSupported("whatsapp"), true);
    assert.match(channelsPage, /isChannelManagementUiSupported/);
    assert.match(channelsPage, /creatableChannelTypes/);
  });
});

describe("Dashboard section route loading", () => {
  it("waits for commercial lookup on any-channel routes", () => {
    assert.match(dashboardSectionRoute, /requiresAnyChannelEntitlement && commercialLoading/);
    assert.match(
      dashboardSectionRoute,
      /route\.commercialFeatureCode \|\| route\.requiresAnyChannelEntitlement/,
    );
  });
});

describe("Omnichannel dispatch API authorization", () => {
  it("I omnichannel + whatsapp channel checks present", () => {
    assert.match(omnichannelRoute, /requireCompanyFeature\(input\.companyId, "omnichannel"\)/);
    assert.match(omnichannelRoute, /resolveChannelCommercialFeatureCode\(input\.channelKey\)/);
    assert.match(omnichannelRoute, /requireCompanyFeature\(input\.companyId, channelFeatureCode\)/);
  });

  it("J–K omnichannel without channel SKU and channel without omnichannel both denied at route layer", () => {
    assert.match(omnichannelRoute, /if \(!channelFeatureCode\)/);
    assert.match(omnichannelRoute, /FeatureNotEntitledError/);
  });

  it("M missing company → DENY", () => {
    assert.match(omnichannelRoute, /if \(!input\.companyId\?\.trim\(\)\)/);
  });

  it("N missing RBAC → DENY", () => {
    assert.match(omnichannelRoute, /conversation\.reply permission is required/);
  });

  it("route commercial helper fail-closed", () => {
    assert.match(routeCommercialAuth, /No company context/);
    assert.match(routeCommercialAuth, /FEATURE_NOT_ENTITLED/);
    assert.match(routeCommercialAuth, /Commercial entitlement check failed/);
  });
});

describe("Test-send and email poll route guards", () => {
  it("P WhatsApp test-send requires whatsapp_channel at route layer", () => {
    assert.match(whatsappRoute, /assertRouteCommercialFeature\(companyId, "whatsapp_channel"\)/);
  });

  it("Email template test-send and test-connection require email_channel", () => {
    assert.match(emailRoute, /assertRouteCommercialFeature\(companyId, "email_channel"\)/);
  });

  it("Q–S email poll requires email_channel before worker invocation", () => {
    assert.match(
      emailChannelRoute,
      /\/email\/poll[\s\S]*assertRouteCommercialFeature\(companyId, "email_channel"\)/,
    );
  });
});

function extractRouteHandler(source: string, routePath: string): string {
  const marker = `router.post("${routePath}"`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const nextRoute = source.indexOf('router.post("', start + marker.length);
  return nextRoute < 0 ? source.slice(start) : source.slice(start, nextRoute);
}

describe("Health probes unchanged", () => {
  it("X health-only endpoints remain without route commercial wrapper", () => {
    const whatsappHealth = extractRouteHandler(whatsappRoute, "/whatsapp/health");
    const emailHealth = extractRouteHandler(emailRoute, "/email/health");
    assert.ok(whatsappHealth.includes("/whatsapp/health"));
    assert.doesNotMatch(whatsappHealth, /assertRouteCommercialFeature/);
    assert.ok(emailHealth.includes("/email/health"));
    assert.doesNotMatch(emailHealth, /assertRouteCommercialFeature/);
  });
});

describe("Regression — migrations untouched", () => {
  it("343 and 344 unchanged by Part 3", () => {
    assert.match(migration343, /343 — Channel permission commercial mapping/);
    assert.match(migration344, /344 — Channel commercial RLS hardening/);
    assert.doesNotMatch(dashboardRegistry, /343_channel_permission/);
    assert.doesNotMatch(omnichannelRoute, /344_channel_commercial_rls/);
  });
});

describe("SKU independence matrix", () => {
  it("omnichannel never grants transport SKUs in dashboard helper", () => {
    assert.equal(
      isAnyChannelManagementEntitled(entitledLookup({ omnichannel: true })),
      false,
    );
  });

  it("individual transport SKU does not grant omnichannel route", () => {
    assert.equal(
      evaluateRouteAccess({
        permission: "ai.conversations.view",
        commercialFeatureCode: "omnichannel",
        hasPermission: perms("ai.conversations.view"),
        commercialFeatureEnabled: entitledLookup({ whatsapp_channel: true }),
      }),
      false,
    );
  });
});
