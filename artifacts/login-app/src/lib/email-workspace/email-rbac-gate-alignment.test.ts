/**
 * Email RBAC gate alignment — Email Workspace uses email.view, Channels stays on channels.view.
 * Run: pnpm exec tsx --test src/lib/email-workspace/email-rbac-gate-alignment.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { overlayPermissionModuleId } from "../rbac/permission-module-taxonomy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const loginApp = resolve(here, "../../..");
const projectRoot = resolve(loginApp, "../..");

function read(rel: string): string {
  return readFileSync(join(loginApp, rel), "utf8");
}

describe("Email Workspace authorization alignment", () => {
  it("registry Email route is email.view; Channels remains channels.view", () => {
    const registry = read("src/config/dashboard-route-registry.ts");
    const emailStart = registry.indexOf('id: "email"');
    const emailBlock = registry.slice(emailStart, registry.indexOf('id: "ai-usage"', emailStart));
    assert.match(emailBlock, /permission: "email.view"/);
    assert.match(emailBlock, /commercialFeatureCode: "email_channel"/);

    const channelsStart = registry.indexOf('id: "channels"');
    const channelsBlock = registry.slice(channelsStart, registry.indexOf('id: "communication"', channelsStart));
    assert.match(channelsBlock, /permission: "channels.view"/);
    assert.doesNotMatch(channelsBlock, /permission: "email.view"/);
  });

  it("sidebar and section route stay generic consumers of the registry", () => {
    const sidebar = read("src/components/app-shell/app-sidebar.tsx");
    const section = read("src/components/dashboard/dashboard-section-route.tsx");
    assert.match(sidebar, /isDashboardRoutePermitted/);
    assert.match(section, /isDashboardRoutePermitted/);
    assert.doesNotMatch(sidebar, /email\.view/);
    assert.doesNotMatch(section, /email\.view/);
  });

  it("Email Workspace compose does not require channels.view", () => {
    const panel = read("src/components/email/email-workspace-panel.tsx");
    assert.match(panel, /useEmailWorkspaceCompanyChannel/);
    assert.match(panel, /hasPermission\("email.view"\)/);
    assert.match(panel, /hasPermission\("ai.conversations.reply"\)/);
    assert.doesNotMatch(panel, /useCompanyChannelsAdmin/);
    assert.doesNotMatch(panel, /"channels.view"/);
  });

  it("Email Settings still resolve the channel via Channels admin lookup", () => {
    const settings = read("src/pages/dashboard/settings/email-settings-page.tsx");
    const health = read("src/hooks/notifications/use-email-health.ts");
    assert.match(settings, /useEmailCompanyChannel/);
    assert.match(health, /useCompanyChannelsAdmin/);
    assert.match(health, /useEmailWorkspaceCompanyChannel/);
  });

  it("Roles editor keeps channels.view out of Email", () => {
    assert.equal(overlayPermissionModuleId("email.view"), "email");
    assert.equal(overlayPermissionModuleId("channels.view"), null);
  });

  it("company_channels and channel_sessions RLS still require channels.view", () => {
    const rls111 = readFileSync(join(projectRoot, "supabase/migrations/111_rbac_enforcement.sql"), "utf8");
    const rls113 = readFileSync(join(projectRoot, "supabase/migrations/113_rbac_rls_completion.sql"), "utf8");
    assert.match(rls111, /company_channels_select[\s\S]*user_has_permission\('channels.view'\)/);
    assert.match(rls113, /channel_sessions_select[\s\S]*company_has_permission\(company_id, 'channels.view'\)/);
  });

  it("conversation visibility policies are unchanged", () => {
    const vis = readFileSync(
      join(projectRoot, "supabase/migrations/357_conversation_view_assigned_visibility.sql"),
      "utf8",
    );
    assert.match(vis, /ai\.conversations\.view_assigned/);
    assert.match(vis, /assigned_user_id = auth.uid\(\)/);
    assert.doesNotMatch(vis, /email\.view/);
  });

  it("workspace-channel API requires email.view and does not return secrets", () => {
    const route = readFileSync(
      join(projectRoot, "artifacts/api-server/src/routes/email-workspace-channel.ts"),
      "utf8",
    );
    assert.match(route, /requireCompanyPermission\(userClient, companyId, "email.view"\)/);
    assert.match(route, /assertRouteCommercialFeature\(companyId, "email_channel"\)/);
    assert.match(route, /fromEmail/);
    assert.doesNotMatch(route, /webhook_secret/);
    assert.doesNotMatch(route, /smtpPassword/);
    assert.doesNotMatch(route, /imapPassword/);
    assert.match(route, /toPublicEmailWorkspaceChannel/);
  });

  it("CompanyChannelService list still requires channels.view", () => {
    const service = readFileSync(
      join(projectRoot, "lib/channel-registry/src/services/company-channel-service.ts"),
      "utf8",
    );
    const listAt = service.indexOf("async listCompanyChannels");
    const listSlice = service.slice(listAt, listAt + 400);
    assert.match(listSlice, /CHANNEL_PERMISSIONS.view/);
  });
});
