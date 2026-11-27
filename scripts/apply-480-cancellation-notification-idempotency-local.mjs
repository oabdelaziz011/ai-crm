/**
 * Local-only: apply migration 480 and record schema_migrations.
 */
import { applyLocalMigration } from "./_lib-apply-migration-local.mjs";

await applyLocalMigration({
  version: "480",
  migrationFile: "480_cancellation_notification_idempotency.sql",
  verifySql: async (c) => {
    const col = await c.query(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='notifications'
        and column_name='idempotency_key'
    `);
    const idx = await c.query(`
      select indexname from pg_indexes
      where indexname='notifications_company_user_idempotency_uidx'
    `);
    const reqCols = await c.query(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='sales_order_cancellation_requests'
        and column_name like 'customer_notify%'
      order by 1
    `);
    return {
      notificationsIdempotencyKey: col.rows.map((r) => r.column_name),
      uniqueIndex: idx.rows.map((r) => r.indexname),
      requestCustomerNotifyCols: reqCols.rows.map((r) => r.column_name),
    };
  },
});
