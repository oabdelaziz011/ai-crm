import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const panelPath = join(here, "../../components/channels/whatsapp-connection-lifecycle-panel.tsx");
const pagePath = join(here, "../../pages/dashboard/settings/whatsapp-settings-page.tsx");
const clientPath = join(here, "whatsapp-connection-lifecycle-client.ts");
const migrationPath = join(
  here,
  "../../../../../supabase/migrations/447_whatsapp_connection_lifecycle.sql",
);

describe("whatsapp connection lifecycle UI wiring", () => {
  it("exposes lifecycle panel on WhatsApp settings page", () => {
    const page = readFileSync(pagePath, "utf8");
    assert.match(page, /WhatsAppConnectionLifecyclePanel/);
    assert.match(page, /disconnectWhatsAppConnection/);
  });

  it("panel never posts tokens and requires confirmation controls", () => {
    const panel = readFileSync(panelPath, "utf8");
    assert.match(panel, /whatsapp-lifecycle-disconnect/);
    assert.match(panel, /whatsapp-lifecycle-transfer/);
    assert.doesNotMatch(panel, /access_token\s*:/);
    assert.doesNotMatch(panel, /p_access_token/);
  });

  it("client calls lifecycle API paths only", () => {
    const client = readFileSync(clientPath, "utf8");
    assert.match(client, /\/whatsapp\/disconnect/);
    assert.match(client, /\/whatsapp\/transfer/);
    assert.match(client, /\/whatsapp\/lifecycle-events/);
  });

  it("migration forbids Meta destructive Graph wording and clears bindings", () => {
    const sql = readFileSync(migrationPath, "utf8");
    assert.match(sql, /disconnect_company_whatsapp_connection/);
    assert.match(sql, /transfer_company_whatsapp_connection/);
    assert.match(sql, /whatsapp_connection_lifecycle_events/);
    assert.match(sql, /meta_graph_calls', 'none'/);
    assert.match(sql, /phone_number_id = ''/);
    assert.doesNotMatch(sql, /graph\.facebook\.com|https?:\/\/|subscribed_apps/);
    assert.doesNotMatch(sql, /perform\s+.*deregister|http_request|net\.http/i);
  });
});
