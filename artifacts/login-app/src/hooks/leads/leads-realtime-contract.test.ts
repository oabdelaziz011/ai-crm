import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEADS_REALTIME_INVALIDATION_KEYS,
  leadsRealtimeCoversKanbanTableAndLead360,
} from "./leads-realtime-contract.ts";

describe("leads realtime invalidation", () => {
  it("covers kanban, the leads table, and Lead360 from one prefix set", () => {
    assert.equal(leadsRealtimeCoversKanbanTableAndLead360(), true);
    const workspace = readFileSync(fileURLToPath(new URL("./use-leads-workspace.ts", import.meta.url)), "utf8");
    const lead360 = readFileSync(fileURLToPath(new URL("./use-lead360-workspace.ts", import.meta.url)), "utf8");
    const realtime = readFileSync(fileURLToPath(new URL("./use-leads-realtime.ts", import.meta.url)), "utf8");
    assert.match(workspace, /\["leads-workspace", "kanban"/);
    assert.match(workspace, /\["leads-workspace", "list"/);
    assert.match(lead360, /\["lead360-workspace"/);
    assert.match(realtime, /LEADS_REALTIME_INVALIDATION_KEYS/);
    assert.match(realtime, /table: "leads", column: "company_id"/);
    assert.match(realtime, /table: "entity_activities", column: "tenant_id"/);
    assert.doesNotMatch(realtime, /table: "lead_tags"/);
    const primaryBindings = realtime.match(/const LEADS_REALTIME_BINDINGS = \[[\s\S]*?\] as const;/);
    assert.ok(primaryBindings);
    assert.doesNotMatch(primaryBindings[0], /lead_tags/);
    assert.doesNotMatch(realtime, /table: "lead_tag_assignments"/);
    const opportunities = readFileSync(
      fileURLToPath(new URL("../opportunities/use-opportunities-realtime.ts", import.meta.url)),
      "utf8",
    );
    assert.match(opportunities, /"opportunities"/);
    assert.match(opportunities, /"opportunity_history"/);
    assert.match(opportunities, /"opportunity_stages"/);
    assert.match(opportunities, /company_id=eq\.\$\{companyId\}/);
    const publication = readFileSync(
      fileURLToPath(new URL("../../../../../supabase/migrations/435_sales_realtime_publication.sql", import.meta.url)),
      "utf8",
    );
    for (const table of ["opportunities", "opportunity_history", "opportunity_stages"]) {
      assert.match(publication, new RegExp(`add table public\\.${table};`));
      assert.match(publication, new RegExp(`alter table public\\.${table} replica identity full;`));
    }
    assert.match(publication, /alter table public\.leads replica identity full;/);
    const activities = readFileSync(
      fileURLToPath(new URL("../../../../../supabase/migrations/436_entity_activities_replica_identity.sql", import.meta.url)),
      "utf8",
    );
    assert.match(activities, /alter table public\.entity_activities replica identity full;/);
    assert.doesNotMatch(activities, /grant /i);
    assert.doesNotMatch(publication, /add table public\.lead_tags;/);
    assert.doesNotMatch(publication, /grant /i);
    assert.ok(LEADS_REALTIME_INVALIDATION_KEYS.some((key) => key[0] === "leads-workspace"));
  });
});
