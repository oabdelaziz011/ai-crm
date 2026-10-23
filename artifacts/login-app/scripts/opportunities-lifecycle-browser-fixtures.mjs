/**
 * LOCAL-ONLY tagged fixtures for Opportunities browser gap closure.
 * Creates + cleans only rows with metadata.auditTag = TAG.
 * Target: demo-platform@vaultos.local company on localstack PG.
 */
import { randomUUID } from "node:crypto";
import pg from "../../../lib/db/node_modules/pg/lib/index.js";

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DEMO_EMAIL = "demo-platform@vaultos.local";
export const TAG = `opp-browser-audit-${Date.now()}`;

export async function createLifecycleBrowserFixtures() {
  const db = new pg.Client({ connectionString: LOCAL_DB });
  await db.connect();
  try {
    const user = await db.query(
      `select u.id::text as user_id, p.company_id::text as company_id
         from auth.users u
         join public.profiles p on p.user_id = u.id
        where lower(u.email) = lower($1)
        limit 1`,
      [DEMO_EMAIL],
    );
    if (!user.rows[0]?.company_id) throw new Error("demo-platform company not found");
    const companyId = user.rows[0].company_id;
    const actorId = user.rows[0].user_id;

    await db.query(`select public.lead_platform_ensure_default_pipeline($1)`, [companyId]);
    await db.query(`select public.opportunity_platform_ensure_default_pipeline($1)`, [companyId]);

    const leadPipe = await db.query(
      `select p.id as pipeline_id,
              (select s.id from public.lead_stages s
                where s.pipeline_id = p.id and s.company_id = p.company_id and s.deleted_at is null
                  and s.lifecycle_status = 'demo_scheduled' limit 1) as demo_stage_id,
              (select s.id from public.lead_stages s
                where s.pipeline_id = p.id and s.company_id = p.company_id and s.deleted_at is null
                order by s.sort_order asc limit 1) as any_stage_id
         from public.lead_pipelines p
        where p.company_id = $1 and p.deleted_at is null
        order by p.is_default desc nulls last
        limit 1`,
      [companyId],
    );
    const pipelineId = leadPipe.rows[0]?.pipeline_id;
    const demoStageId = leadPipe.rows[0]?.demo_stage_id ?? leadPipe.rows[0]?.any_stage_id;
    if (!pipelineId || !demoStageId) throw new Error("lead pipeline/demo stage missing");

    const leadId = randomUUID();
    const leadTitle = `${TAG}-demo-lead`;
    await db.query(
      `insert into public.leads (
         id, company_id, pipeline_id, stage_id, title, contact_name, email, phone,
         lifecycle_status, is_qualified, qualified_at, created_by, updated_by, metadata
       ) values (
         $1,$2,$3,$4,$5,$5,$6,$7,
         'demo_scheduled', true, now(), $8, $8, $9::jsonb
       )`,
      [
        leadId,
        companyId,
        pipelineId,
        demoStageId,
        leadTitle,
        `${TAG}@example.invalid`,
        `+1555${String(Date.now()).slice(-7)}`,
        actorId,
        JSON.stringify({ auditTag: TAG, source: "browser-lifecycle-audit" }),
      ],
    );

    // If lifecycle_status column write is overridden by stage trigger, force via update.
    await db.query(
      `update public.leads
          set lifecycle_status = 'demo_scheduled',
              stage_id = coalesce($2, stage_id),
              metadata = coalesce(metadata,'{}'::jsonb) || $3::jsonb
        where id = $1`,
      [leadId, leadPipe.rows[0]?.demo_stage_id, JSON.stringify({ auditTag: TAG })],
    );

    const oppPipe = await db.query(
      `select p.id as pipeline_id,
              (select s.id from public.opportunity_stages s
                where s.pipeline_id = p.id and s.company_id = p.company_id and s.deleted_at is null
                  and s.stage_key = 'qualification' limit 1) as stage_id,
              (select s.id from public.opportunity_stages s
                where s.pipeline_id = p.id and s.company_id = p.company_id and s.deleted_at is null
                  and s.stage_key = 'lost' limit 1) as lost_stage_id
         from public.opportunity_pipelines p
        where p.company_id = $1 and p.deleted_at is null
        order by p.is_default desc nulls last
        limit 1`,
      [companyId],
    );
    const opportunityId = randomUUID();
    const oppName = `${TAG}-opp`;
    await db.query(
      `insert into public.opportunities (
         id, company_id, pipeline_id, stage_id, name, primary_contact_name,
         currency, probability_percent, probability_source, probability_reason,
         created_by, updated_by, metadata
       ) values (
         $1,$2,$3,$4,$5,$5,
         'USD', 10, 'manual', 'browser audit fixture',
         $6,$6,$7::jsonb
       )`,
      [
        opportunityId,
        companyId,
        oppPipe.rows[0].pipeline_id,
        oppPipe.rows[0].stage_id,
        oppName,
        actorId,
        JSON.stringify({ auditTag: TAG, source: "browser-lifecycle-audit" }),
      ],
    );

    return {
      db,
      tag: TAG,
      companyId,
      actorId,
      leadId,
      leadTitle,
      opportunityId,
      oppName,
      lostStageId: oppPipe.rows[0]?.lost_stage_id ?? null,
    };
  } catch (error) {
    await db.end().catch(() => undefined);
    throw error;
  }
}

export async function cleanupLifecycleBrowserFixtures(db, tag) {
  if (!db || !tag) return;
  try {
    await db.query("begin");
    await db.query("set local session_replication_role = replica");
    const opps = await db.query(
      `select id from public.opportunities where metadata->>'auditTag' = $1`,
      [tag],
    );
    const leads = await db.query(
      `select id from public.leads where metadata->>'auditTag' = $1`,
      [tag],
    );
    const oppIds = opps.rows.map((r) => r.id);
    const leadIds = leads.rows.map((r) => r.id);
    if (oppIds.length) {
      await db.query(`delete from public.opportunity_history where opportunity_id = any($1::uuid[])`, [
        oppIds,
      ]);
      await db.query(`delete from public.opportunity_line_items where opportunity_id = any($1::uuid[])`, [
        oppIds,
      ]);
      await db.query(`delete from public.opportunities where id = any($1::uuid[])`, [oppIds]);
    }
    if (leadIds.length) {
      await db.query(`delete from public.lead_history where lead_id = any($1::uuid[])`, [leadIds]);
      await db.query(`delete from public.lead_activities where lead_id = any($1::uuid[])`, [leadIds]);
      await db.query(`delete from public.leads where id = any($1::uuid[])`, [leadIds]);
    }
    await db.query("commit");
    return { opportunities: oppIds.length, leads: leadIds.length };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await db.end().catch(() => undefined);
  }
}
