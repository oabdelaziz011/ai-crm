/**
 * Local-only: apply migration 482 and record schema_migrations.
 */
import { applyLocalMigration } from "./_lib-apply-migration-local.mjs";

await applyLocalMigration({
  version: "482",
  migrationFile: "482_company_whatsapp_template_bindings.sql",
  verifySql: async (c) => {
    const cols = await c.query(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='company_whatsapp_settings'
        and column_name='template_bindings'
    `);
    return { templateBindings: cols.rows.map((r) => r.column_name) };
  },
});
