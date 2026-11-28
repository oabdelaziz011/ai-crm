/**
 * Local-only: apply migration 479 and record schema_migrations.
 */
import { applyLocalMigration } from "./_lib-apply-migration-local.mjs";

await applyLocalMigration({
  version: "479",
  migrationFile: "479_sales_order_customer_cancellation.sql",
  verifySql: async (c) => {
    const cols = await c.query(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='sales_orders'
        and column_name in (
          'cancellation_source','cancellation_reason','cancelled_from_status',
          'cancellation_notify_status','cancellation_notify_idempotency_key'
        )
      order by 1
    `);
    const table = await c.query(`
      select to_regclass('public.sales_order_cancellation_requests') as reg
    `);
    const tools = await c.query(`
      select key from public.tool_definitions
      where key in (
        'list_customer_orders_for_cancellation',
        'get_order_cancellation_eligibility',
        'confirm_order_cancellation'
      )
      order by 1
    `);
    const perm = await c.query(`
      select code from public.permissions where code = 'orders.approve_cancellation'
    `);
    return {
      columns: cols.rows.map((r) => r.column_name),
      cancellationRequestsTable: table.rows[0]?.reg ?? null,
      tools: tools.rows.map((r) => r.key),
      permission: perm.rows.map((r) => r.code),
    };
  },
});
