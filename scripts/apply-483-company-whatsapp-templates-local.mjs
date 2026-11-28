/**
 * Local-only: apply migration 483 and record schema_migrations.
 */
import { applyLocalMigration } from "./_lib-apply-migration-local.mjs";

await applyLocalMigration({
  version: "483",
  migrationFile: "483_company_whatsapp_templates.sql",
  verifySql: async (c) => {
    const table = await c.query(`
      select to_regclass('public.company_whatsapp_templates') as reg
    `);
    const policies = await c.query(`
      select policyname from pg_policies
      where schemaname='public' and tablename='company_whatsapp_templates'
      order by 1
    `);
    return {
      table: table.rows[0]?.reg,
      policies: policies.rows.map((r) => r.policyname),
    };
  },
});
