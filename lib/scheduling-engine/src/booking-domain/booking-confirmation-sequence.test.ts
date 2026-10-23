import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL(
    "../../../../supabase/migrations/413_sequential_booking_confirmation_numbers.sql",
    import.meta.url,
  ),
);
const uniqueIndexPath = fileURLToPath(
  new URL(
    "../../../../supabase/migrations/256_scheduling_booking_confirmation_number.sql",
    import.meta.url,
  ),
);

describe("booking confirmation sequence", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const indexSql = readFileSync(uniqueIndexPath, "utf8");

  it("assigns the next company sequence under a row lock and skips numbers already stored", () => {
    assert.match(sql, /for update;/);
    assert.match(sql, /v_next := v_next \+ 1;/);
    assert.match(sql, /confirmation_number = 'BK-' \|\| lpad\(v_next::text, 6, '0'\)/);
    assert.doesNotMatch(sql, /update public\.scheduling_bookings/i);
  });

  it("keeps a supplied number only when the insert already has one, so cancellation cannot recycle it", () => {
    assert.match(
      sql,
      /if new\.confirmation_number is not null and btrim\(new\.confirmation_number\) <> '' then\s*return new;/s,
    );
    assert.match(indexSql, /create unique index if not exists idx_scheduling_bookings_company_confirmation_number/);
    assert.match(indexSql, /where confirmation_number is not null/);
  });
});
