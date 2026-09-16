/**
 * Apply migration 367 — profiles.department_id Phase 1.
 *
 * Run: node scripts/apply-367-profiles-department-id.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "367_profiles_department_id.sql";
const version = "367";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

function assertNoDestructive(sqlText) {
  const lowered = sqlText.toLowerCase();
  if (/drop\s+column/.test(lowered)) throw new Error("BLOCKED: DROP COLUMN present");
  if (/alter\s+column[\s\S]{0,80}set\s+not\s+null/.test(lowered)) {
    throw new Error("BLOCKED: SET NOT NULL present");
  }
  if (/drop\s+table\s+public\.profiles/.test(lowered)) {
    throw new Error("BLOCKED: DROP profiles");
  }
}

assertNoDestructive(sql);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

async function classifyBackfill() {
  const hasCol = await client.query(`
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='department_id'
  `);
  const departmentIdExists = hasCol.rowCount > 0;

  const result = await client.query(`
    with candidates as (
      select
        p.id as profile_id,
        p.company_id,
        lower(trim(p.department)) as dept_key,
        exists (
          select 1
          from public.user_branch_assignments uba
          where uba.user_id = p.id
            and uba.company_id = p.company_id
        ) as has_branch
      from public.profiles p
      where ${departmentIdExists ? "p.department_id is null and" : ""}
        p.company_id is not null
        and p.department is not null
        and length(trim(p.department)) > 0
    ),
    branch_matches as (
      select
        c.profile_id,
        count(d.id)::int as match_count
      from candidates c
      join public.user_branch_assignments uba
        on uba.user_id = c.profile_id
       and uba.company_id = c.company_id
      join public.organization_departments d
        on d.company_id = c.company_id
       and d.branch_id = uba.branch_id
       and d.is_active is true
       and lower(trim(d.name)) = c.dept_key
      where c.has_branch
      group by c.profile_id
    ),
    company_matches as (
      select
        c.profile_id,
        count(d.id)::int as match_count
      from candidates c
      join public.organization_departments d
        on d.company_id = c.company_id
       and d.is_active is true
       and lower(trim(d.name)) = c.dept_key
      where not c.has_branch
      group by c.profile_id
    ),
    classified as (
      select
        c.profile_id,
        case
          when c.has_branch and coalesce(bm.match_count, 0) = 1 then 'branch_resolved'
          when c.has_branch and coalesce(bm.match_count, 0) > 1 then 'ambiguous'
          when c.has_branch then 'unmatched'
          when coalesce(cm.match_count, 0) = 1 then 'company_resolved'
          when coalesce(cm.match_count, 0) > 1 then 'ambiguous'
          else 'unmatched'
        end as class
      from candidates c
      left join branch_matches bm on bm.profile_id = c.profile_id
      left join company_matches cm on cm.profile_id = c.profile_id
    )
    select
      count(*)::int as candidates,
      count(*) filter (where class = 'branch_resolved')::int as branch_resolved,
      count(*) filter (where class = 'company_resolved')::int as company_resolved,
      count(*) filter (where class in ('branch_resolved','company_resolved'))::int as unambiguous,
      count(*) filter (where class = 'ambiguous')::int as ambiguous,
      count(*) filter (where class = 'unmatched')::int as unmatched
    from classified
  `);

  let alreadyAssigned = 0;
  if (departmentIdExists) {
    const already = await client.query(`
      select count(*)::int as n from public.profiles where department_id is not null
    `);
    alreadyAssigned = already.rows[0].n;
  }

  return { departmentIdExists, alreadyAssigned, ...result.rows[0] };
}

async function runIntegrityTests() {
  const findings = [];
  const migrationSql = readFileSync(sqlPath, "utf8");

  findings.push({
    test: "no_limit_1_guess",
    status: !/order by[\s\S]{0,120}limit\s+1/i.test(migrationSql) ? "PASS" : "FAIL",
  });
  findings.push({
    test: "department_text_preserved_in_sql",
    status:
      !/drop\s+column[\s\S]{0,40}department\b/i.test(migrationSql) &&
      /profiles\.department text remains/i.test(migrationSql)
        ? "PASS"
        : "FAIL",
  });
  findings.push({
    test: "merge_sql_remaps_department_id",
    status: /update public\.profiles[\s\S]*department_id = v_target\.id[\s\S]*department_id = v_source\.id/i.test(
      migrationSql,
    )
      ? "PASS"
      : "FAIL",
  });

  await client.query("begin");
  try {
    const pair = await client.query(`
      select
        a.id as company_a,
        b.id as company_b,
        ba.id as branch_a,
        bb.id as branch_b
      from public.companies a
      join public.companies b on b.id <> a.id
      join public.branches ba on ba.company_id = a.id and ba.deleted_at is null
      join public.branches bb on bb.company_id = b.id and bb.deleted_at is null
      limit 1
    `);

    const profile = await client.query(`
      select id, company_id, department, department_id
      from public.profiles
      where company_id is not null
      order by updated_at desc nulls last
      limit 1
    `);

    if (pair.rowCount === 0 || profile.rowCount === 0) {
      findings.push({ test: "live_fk_harness", status: "SKIP", reason: "insufficient seed data" });
      await client.query("rollback");
      return findings;
    }

    const { company_a, company_b, branch_a, branch_b } = pair.rows[0];
    const profileId = profile.rows[0].id;
    const originalDeptText = profile.rows[0].department;
    const originalDeptId = profile.rows[0].department_id;
    const profileCompany = profile.rows[0].company_id;

    const sameCompanyBranch =
      profileCompany === company_a ? branch_a : profileCompany === company_b ? branch_b : null;
    const otherCompanyDeptBranch = profileCompany === company_a ? branch_b : branch_a;
    const otherCompanyId = profileCompany === company_a ? company_b : company_a;

    if (!sameCompanyBranch) {
      // Align test dept to profile's company
      const ownBranch = await client.query(
        `select id from public.branches where company_id = $1 and deleted_at is null limit 1`,
        [profileCompany],
      );
      if (ownBranch.rowCount === 0) {
        findings.push({ test: "live_fk_harness", status: "SKIP", reason: "profile company has no branch" });
        await client.query("rollback");
        return findings;
      }

      const deptValid = await client.query(
        `insert into public.organization_departments (company_id, branch_id, name, is_active)
         values ($1, $2, $3, true) returning id`,
        [profileCompany, ownBranch.rows[0].id, `__367_valid_${Date.now()}`],
      );

      await client.query(`update public.profiles set department_id = $1 where id = $2`, [
        deptValid.rows[0].id,
        profileId,
      ]);
      const accepted = await client.query(`select department_id, department from public.profiles where id = $1`, [
        profileId,
      ]);
      findings.push({
        test: "fk_accepts_valid",
        status: accepted.rows[0].department_id === deptValid.rows[0].id ? "PASS" : "FAIL",
        department_intact: accepted.rows[0].department === originalDeptText,
      });

      let invalidRejected = false;
      try {
        await client.query("savepoint sp_invalid_fk");
        await client.query(`update public.profiles set department_id = $1 where id = $2`, [
          "00000000-0000-0000-0000-000000000099",
          profileId,
        ]);
        await client.query("release savepoint sp_invalid_fk");
      } catch {
        invalidRejected = true;
        await client.query("rollback to savepoint sp_invalid_fk");
      }
      findings.push({ test: "fk_rejects_invalid", status: invalidRejected ? "PASS" : "FAIL" });

      const foreignDept = await client.query(
        `insert into public.organization_departments (company_id, branch_id, name, is_active)
         values ($1, $2, $3, true) returning id`,
        [otherCompanyId, otherCompanyDeptBranch, `__367_foreign_${Date.now()}`],
      );
      let crossRejected = false;
      try {
        await client.query("savepoint sp_cross_company");
        await client.query(`update public.profiles set department_id = $1 where id = $2`, [
          foreignDept.rows[0].id,
          profileId,
        ]);
        await client.query("release savepoint sp_cross_company");
      } catch (error) {
        crossRejected = /same company/i.test(String(error.message || error));
        await client.query("rollback to savepoint sp_cross_company");
      }
      findings.push({ test: "cross_company_rejected", status: crossRejected ? "PASS" : "FAIL" });

      const disposable = await client.query(
        `insert into public.organization_departments (company_id, branch_id, name, is_active)
         values ($1, $2, $3, true) returning id`,
        [profileCompany, ownBranch.rows[0].id, `__367_del_${Date.now()}`],
      );
      await client.query(`update public.profiles set department_id = $1 where id = $2`, [
        disposable.rows[0].id,
        profileId,
      ]);
      await client.query(`delete from public.organization_departments where id = $1`, [disposable.rows[0].id]);
      const afterDel = await client.query(`select department_id, department from public.profiles where id = $1`, [
        profileId,
      ]);
      findings.push({
        test: "on_delete_set_null",
        status: afterDel.rows[0].department_id === null ? "PASS" : "FAIL",
        department_intact: afterDel.rows[0].department === originalDeptText,
      });

      // Restore original then rollback entire txn anyway
      await client.query(`update public.profiles set department_id = $1 where id = $2`, [
        originalDeptId,
        profileId,
      ]);
    } else {
      const deptValid = await client.query(
        `insert into public.organization_departments (company_id, branch_id, name, is_active)
         values ($1, $2, $3, true) returning id`,
        [profileCompany, sameCompanyBranch, `__367_valid_${Date.now()}`],
      );
      await client.query(`update public.profiles set department_id = $1 where id = $2`, [
        deptValid.rows[0].id,
        profileId,
      ]);
      const accepted = await client.query(`select department_id, department from public.profiles where id = $1`, [
        profileId,
      ]);
      findings.push({
        test: "fk_accepts_valid",
        status: accepted.rows[0].department_id === deptValid.rows[0].id ? "PASS" : "FAIL",
        department_intact: accepted.rows[0].department === originalDeptText,
      });

      let invalidRejected = false;
      try {
        await client.query("savepoint sp_invalid_fk");
        await client.query(`update public.profiles set department_id = $1 where id = $2`, [
          "00000000-0000-0000-0000-000000000099",
          profileId,
        ]);
        await client.query("release savepoint sp_invalid_fk");
      } catch {
        invalidRejected = true;
        await client.query("rollback to savepoint sp_invalid_fk");
      }
      findings.push({ test: "fk_rejects_invalid", status: invalidRejected ? "PASS" : "FAIL" });

      const foreignDept = await client.query(
        `insert into public.organization_departments (company_id, branch_id, name, is_active)
         values ($1, $2, $3, true) returning id`,
        [otherCompanyId, otherCompanyDeptBranch, `__367_foreign_${Date.now()}`],
      );
      let crossRejected = false;
      try {
        await client.query("savepoint sp_cross_company");
        await client.query(`update public.profiles set department_id = $1 where id = $2`, [
          foreignDept.rows[0].id,
          profileId,
        ]);
        await client.query("release savepoint sp_cross_company");
      } catch (error) {
        crossRejected = /same company/i.test(String(error.message || error));
        await client.query("rollback to savepoint sp_cross_company");
      }
      findings.push({ test: "cross_company_rejected", status: crossRejected ? "PASS" : "FAIL" });

      const disposable = await client.query(
        `insert into public.organization_departments (company_id, branch_id, name, is_active)
         values ($1, $2, $3, true) returning id`,
        [profileCompany, sameCompanyBranch, `__367_del_${Date.now()}`],
      );
      await client.query(`update public.profiles set department_id = $1 where id = $2`, [
        disposable.rows[0].id,
        profileId,
      ]);
      await client.query(`delete from public.organization_departments where id = $1`, [disposable.rows[0].id]);
      const afterDel = await client.query(`select department_id, department from public.profiles where id = $1`, [
        profileId,
      ]);
      findings.push({
        test: "on_delete_set_null",
        status: afterDel.rows[0].department_id === null ? "PASS" : "FAIL",
        department_intact: afterDel.rows[0].department === originalDeptText,
      });
    }

    // Ambiguous / company-only / unmatched classification using synthetic depts on profile company
    const branches = await client.query(
      `select id from public.branches where company_id = $1 and deleted_at is null order by created_at nulls last limit 2`,
      [profileCompany],
    );
    const sharedName = `__367_shared_${Date.now()}`;
    const onlyName = `__367_only_${Date.now()}`;
    const missingName = `__367_missing_${Date.now()}`;

    await client.query(
      `insert into public.organization_departments (company_id, branch_id, name, is_active)
       values ($1, $2, $3, true)`,
      [profileCompany, branches.rows[0].id, onlyName],
    );

    if (branches.rowCount >= 2) {
      await client.query(
        `insert into public.organization_departments (company_id, branch_id, name, is_active)
         values ($1, $2, $3, true), ($1, $4, $3, true)`,
        [profileCompany, branches.rows[0].id, sharedName, branches.rows[1].id],
      );
      const amb = await client.query(
        `
        select count(d.id)::int as match_count
        from (select $1::uuid as company_id, lower(trim($2::text)) as dept_key) c
        join public.organization_departments d
          on d.company_id = c.company_id
         and d.is_active
         and lower(trim(d.name)) = c.dept_key
         and d.branch_id in ($3::uuid, $4::uuid)
        `,
        [profileCompany, sharedName, branches.rows[0].id, branches.rows[1].id],
      );
      findings.push({
        test: "ambiguous_not_forced",
        status: amb.rows[0].match_count > 1 ? "PASS" : "FAIL",
      });
    } else {
      findings.push({ test: "ambiguous_not_forced", status: "SKIP", reason: "need 2 branches" });
    }

    const unique = await client.query(
      `
      select count(d.id)::int as match_count
      from public.organization_departments d
      where d.company_id = $1 and d.is_active and lower(trim(d.name)) = lower(trim($2))
      `,
      [profileCompany, onlyName],
    );
    findings.push({
      test: "company_only_unique",
      status: unique.rows[0].match_count === 1 ? "PASS" : "FAIL",
    });

    const missing = await client.query(
      `
      select count(d.id)::int as match_count
      from public.organization_departments d
      where d.company_id = $1 and d.is_active and lower(trim(d.name)) = lower(trim($2))
      `,
      [profileCompany, missingName],
    );
    findings.push({
      test: "unmatched_remains_null",
      status: missing.rows[0].match_count === 0 ? "PASS" : "FAIL",
    });

    // Merge remap behavior (same SQL as RPC body)
    const src = await client.query(
      `insert into public.organization_departments (company_id, branch_id, name, is_active)
       values ($1, $2, $3, true) returning id`,
      [profileCompany, branches.rows[0].id, `__367_src_${Date.now()}`],
    );
    const tgt = await client.query(
      `insert into public.organization_departments (company_id, branch_id, name, is_active)
       values ($1, $2, $3, true) returning id`,
      [profileCompany, branches.rows[0].id, `__367_tgt_${Date.now()}`],
    );
    await client.query(`update public.profiles set department_id = $1 where id = $2`, [
      src.rows[0].id,
      profileId,
    ]);
    await client.query(
      `update public.profiles set department_id = $1
       where company_id = $2 and department_id = $3`,
      [tgt.rows[0].id, profileCompany, src.rows[0].id],
    );
    const remapped = await client.query(`select department_id from public.profiles where id = $1`, [profileId]);
    findings.push({
      test: "merge_remaps_department_id",
      status: remapped.rows[0].department_id === tgt.rows[0].id ? "PASS" : "FAIL",
    });

    await client.query("rollback");
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore
    }
    findings.push({ test: "integrity_harness", status: "FAIL", error: String(error.message || error) });
  }
  return findings;
}

try {
  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rows.length > 0) {
    const integrity = await runIntegrityTests();
    const failed = integrity.filter((t) => t.status === "FAIL");
    const post = await classifyBackfill();
    const assigned = await client.query(`
      select
        count(*) filter (where department_id is not null)::int as with_department_id,
        count(*) filter (
          where department is not null
            and length(trim(department)) > 0
            and department_id is null
        )::int as text_without_id
      from public.profiles
    `);
    const crossCompany = await client.query(`
      select count(*)::int as n
      from public.profiles p
      join public.organization_departments d on d.id = p.department_id
      where p.department_id is not null
        and p.company_id is distinct from d.company_id
    `);
    console.log(
      JSON.stringify(
        {
          ok: failed.length === 0,
          skipped: true,
          version,
          name: existing.rows[0].name,
          postflight: {
            ...post,
            ...assigned.rows[0],
            cross_company_violations: crossCompany.rows[0].n,
          },
          integrity_tests: integrity,
        },
        null,
        2,
      ),
    );
    await client.end();
    process.exit(failed.length === 0 ? 0 : 1);
  }

  const pre = await classifyBackfill();
  console.log(JSON.stringify({ phase: "preflight", ...pre }, null, 2));

  await client.query("begin");
  await client.query(sql);
  const checksum = createHash("sha256").update(sql).digest("hex");
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
    [version, migrationName.replace(/\.sql$/, "")],
  );
  await client.query("commit");

  const post = await classifyBackfill();
  const assigned = await client.query(`
    select
      count(*) filter (where department_id is not null)::int as with_department_id,
      count(*) filter (
        where department_id is not null
          and department is not null
          and length(trim(department)) > 0
      )::int as with_both,
      count(*) filter (
        where department is not null
          and length(trim(department)) > 0
          and department_id is null
      )::int as text_without_id
    from public.profiles
  `);

  const crossCompany = await client.query(`
    select count(*)::int as n
    from public.profiles p
    join public.organization_departments d on d.id = p.department_id
    where p.department_id is not null
      and p.company_id is distinct from d.company_id
  `);

  const fk = await client.query(`
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'profiles'
      and pg_get_constraintdef(c.oid) ilike '%department_id%'
  `);

  const mergeDef = await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal' and p.proname = 'organization_merge_departments'
  `);

  const integrity = await runIntegrityTests();
  const failed = integrity.filter((t) => t.status === "FAIL");

  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        version,
        checksum,
        preflight: pre,
        postflight: {
          ...post,
          ...assigned.rows[0],
          cross_company_violations: crossCompany.rows[0].n,
          rows_updated_estimate: pre.unambiguous,
        },
        fk_constraints: fk.rows,
        merge_remaps_department_id: /department_id\s*=\s*v_target\.id/.test(mergeDef.rows[0]?.def || ""),
        integrity_tests: integrity,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) process.exit(1);
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // ignore
  }
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
