import fs from "node:fs";

const lines = fs
  .readFileSync("supabase/migrations/229_production_recovery.sql", "utf8")
  .split("\n");

const unsafe = [];

function add(line, type, reason, fix) {
  unsafe.push({ line: line + 1, type, reason, fix, text: lines[line].trim().slice(0, 120) });
}

// Publications inside DO blocks
for (let i = 0; i < lines.length; i++) {
  if (!/^do \$\$/i.test(lines[i].trim())) continue;
  let j = i + 1;
  const blockLines = [];
  let depth = 1;
  while (j < lines.length && depth > 0) {
    blockLines.push({ line: j, text: lines[j] });
    if (/^do \$\$/i.test(lines[j].trim())) depth++;
    if (/^end \$\$;/.test(lines[j].trim())) depth--;
    j++;
  }
  const blockText = blockLines.map((b) => b.text).join("\n").toLowerCase();
  for (const b of blockLines) {
    if (/^alter publication/i.test(b.text.trim())) {
      const hasExc =
        blockText.includes("duplicate_object") ||
        blockText.includes("undefined_object");
      if (!hasExc) {
        add(
          b.line,
          "ALTER PUBLICATION",
          "Missing duplicate_object/undefined_object handler in enclosing DO block",
          `do $$
begin
  alter publication supabase_realtime add table public.<table>;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;`
        );
      }
    }
  }
  i = j;
}

// Policies
let inDo = 0;
let hasPolCheck = false;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim().toLowerCase();
  if (/^do \$\$/i.test(t)) {
    inDo++;
    hasPolCheck = false;
  }
  if (t.includes("pg_policies")) hasPolCheck = true;
  if (/^end \$\$/i.test(t)) {
    inDo = Math.max(0, inDo - 1);
    hasPolCheck = false;
  }
  if (/^create policy /i.test(lines[i].trim()) && !(inDo > 0 && hasPolCheck)) {
    add(
      i,
      "CREATE POLICY",
      "CREATE POLICY not guarded by pg_policies existence check in same DO block",
      "Wrap in DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_policies ...) ..."
    );
  }
}

// Triggers
inDo = 0;
let hasTrigCheck = false;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim().toLowerCase();
  if (/^do \$\$/i.test(t)) {
    inDo++;
    hasTrigCheck = false;
  }
  if (t.includes("pg_trigger")) hasTrigCheck = true;
  if (/^end \$\$/i.test(t)) {
    inDo = Math.max(0, inDo - 1);
    hasTrigCheck = false;
  }
  if (/^create trigger /i.test(lines[i].trim()) && !(inDo > 0 && hasTrigCheck)) {
    add(
      i,
      "CREATE TRIGGER",
      "CREATE TRIGGER not guarded by pg_trigger existence check",
      "Wrap in DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_trigger ...) ..."
    );
  }
}

// Line-level
lines.forEach((l, idx) => {
  const t = l.trim();
  const tl = t.toLowerCase();
  if (/^create table public\./i.test(t) && !/^create table if not exists/i.test(t)) {
    add(idx, "CREATE TABLE", "Missing IF NOT EXISTS", "CREATE TABLE IF NOT EXISTS ...");
  }
  if (/^create index /i.test(t) && !/^create index if not exists/i.test(t)) {
    add(idx, "CREATE INDEX", "Missing IF NOT EXISTS", "CREATE INDEX IF NOT EXISTS ...");
  }
  if (/^create unique index /i.test(t) && !/^create unique index if not exists/i.test(t)) {
    add(idx, "CREATE INDEX", "Missing IF NOT EXISTS", "CREATE UNIQUE INDEX IF NOT EXISTS ...");
  }
  if (/^create type /i.test(t)) {
    add(idx, "CREATE TYPE", "Not idempotent", "CREATE TYPE IF NOT EXISTS or DO guard");
  }
  if (/^alter table .* add column /i.test(tl) && !tl.includes("if not exists")) {
    add(idx, "ALTER TABLE ADD COLUMN", "Missing IF NOT EXISTS", "ADD COLUMN IF NOT EXISTS ...");
  }
  if (/^alter table .* add constraint /i.test(tl)) {
    add(idx, "ALTER TABLE ADD CONSTRAINT", "Not idempotent", "DO block with pg_constraint check");
  }
  if (/^create function /i.test(t) && !/^create or replace function/i.test(t)) {
    add(idx, "CREATE FUNCTION", "Missing OR REPLACE", "CREATE OR REPLACE FUNCTION ...");
  }
});

const counts = {
  create_table_if_not_exists: (lines.join("\n").match(/create table if not exists/gi) || []).length,
  create_index_if_not_exists: (lines.join("\n").match(/create index if not exists/gi) || []).length,
  create_unique_index_if_not_exists: (lines.join("\n").match(/create unique index if not exists/gi) || []).length,
  create_sequence_if_not_exists: (lines.join("\n").match(/create sequence if not exists/gi) || []).length,
  create_or_replace_function: (lines.join("\n").match(/create or replace function/gi) || []).length,
  create_policy: (lines.join("\n").match(/create policy /gi) || []).length,
  create_trigger: (lines.join("\n").match(/create trigger /gi) || []).length,
  alter_publication: (lines.join("\n").match(/alter publication supabase_realtime/gi) || []).length,
  add_column_if_not_exists: (lines.join("\n").match(/add column if not exists/gi) || []).length,
  grant: (lines.join("\n").match(/^grant /gim) || []).length,
  comment_on: (lines.join("\n").match(/^comment on /gim) || []).length,
  enable_rls: (lines.join("\n").match(/enable row level security/gi) || []).length,
  insert_into: (lines.join("\n").match(/^insert into /gim) || []).length,
};

console.log(JSON.stringify({ unsafe, counts }, null, 2));
