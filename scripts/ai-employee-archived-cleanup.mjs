/**
 * Maintenance script: dry-run and optional execute permanent purge of archived AI employees.
 *
 * Usage:
 *   node scripts/ai-employee-archived-cleanup.mjs --dry-run
 *   node scripts/ai-employee-archived-cleanup.mjs --execute
 *   node scripts/ai-employee-archived-cleanup.mjs --execute --employee-id=<uuid>
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const env = loadProjectEnv(root);

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const dryRun = !execute;
const employeeIdArg = args.find((a) => a.startsWith("--employee-id="));
const filterEmployeeId = employeeIdArg ? employeeIdArg.split("=")[1] : null;

const PROTECTED_COMPANY_PATTERNS = [/^cvp$/i, /nessma/i, /cvp/i];

function isProtectedCompany(name) {
  const value = (name ?? "").trim();
  if (!value) return false;
  return PROTECTED_COMPANY_PATTERNS.some((pattern) => pattern.test(value));
}

function onDeleteLabel(code) {
  return (
    { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" }[code] ?? code
  );
}

async function countDependencies(client, employeeId, companyId) {
  const versions = await client.query(
    `select count(*)::int as c from public.ai_employee_versions where employee_id=$1 and company_id=$2`,
    [employeeId, companyId],
  );
  const deployments = await client.query(
    `select count(*)::int as c from public.ai_employee_deployments where employee_id=$1 and company_id=$2`,
    [employeeId, companyId],
  );
  const changeEvents = await client.query(
    `select count(*)::int as c from public.ai_employee_change_events where employee_id=$1 and company_id=$2`,
    [employeeId, companyId],
  );
  const groupMembers = await client.query(
    `select count(*)::int as c from public.ai_employee_group_members where employee_id=$1 and company_id=$2`,
    [employeeId, companyId],
  );
  const handovers = await client.query(
    `select count(*)::int as c from public.ai_employee_handovers
     where company_id=$2 and (source_employee_id=$1 or destination_employee_id=$1)`,
    [employeeId, companyId],
  );
  const collaborationEvents = await client.query(
    `select count(*)::int as c from public.ai_employee_collaboration_events
     where company_id=$2 and employee_id=$1`,
    [employeeId, companyId],
  );
  const governanceAudit = await client.query(
    `select count(*)::int as c from public.ai_governance_audit_events
     where company_id=$2 and employee_id=$1`,
    [employeeId, companyId],
  );
  const governanceApprovals = await client.query(
    `select count(*)::int as c from public.ai_governance_approvals
     where company_id=$2 and entity_type='employee' and entity_id=$1`,
    [employeeId, companyId],
  );
  const governanceViolations = await client.query(
    `select count(*)::int as c from public.ai_governance_violations
     where company_id=$2 and employee_id=$1`,
    [employeeId, companyId],
  );
  const conversations = await client.query(
    `select count(*)::int as c from public.conversations
     where company_id=$2 and metadata->>'aiEmployeeId' = $1 and deleted_at is null`,
    [employeeId, companyId],
  );
  const activeWorkflows = await client.query(
    `select count(*)::int as c from public.agent_workflows
     where company_id=$2
       and memory #>> '{executionState,pageContext,aiEmployeeId}' = $1
       and status in ('running','waiting_user','planning','paused')`,
    [employeeId, companyId],
  );

  return {
    versions: versions.rows[0]?.c ?? 0,
    deployments: deployments.rows[0]?.c ?? 0,
    change_events: changeEvents.rows[0]?.c ?? 0,
    group_members: groupMembers.rows[0]?.c ?? 0,
    handovers: handovers.rows[0]?.c ?? 0,
    collaboration_events: collaborationEvents.rows[0]?.c ?? 0,
    governance_audit: governanceAudit.rows[0]?.c ?? 0,
    governance_approvals: governanceApprovals.rows[0]?.c ?? 0,
    governance_violations: governanceViolations.rows[0]?.c ?? 0,
    conversations: conversations.rows[0]?.c ?? 0,
    active_workflows: activeWorkflows.rows[0]?.c ?? 0,
  };
}

function evaluateBlockers(employee, dependencies) {
  const reasons = [];
  if (isProtectedCompany(employee.company_name)) reasons.push("protected_company");
  if (employee.status !== "archived") reasons.push("status_not_archived");
  if (dependencies.active_workflows > 0) reasons.push("active_workflow_reference");
  return reasons;
}

if (!env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const fkInventory = await client.query(`
    select
      conrelid::regclass as referencing_table,
      a.attname as referencing_column,
      confdeltype as on_delete_action
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.ai_employees'::regclass
    order by 1, 2
  `);

  const archived = await client.query(
    `select e.id, e.company_id, c.name as company_name, e.name, e.display_name, e.status,
            e.created_at, e.deleted_at
     from public.ai_employees e
     left join public.companies c on c.id = e.company_id
     where e.status = 'archived'
     ${filterEmployeeId ? "and e.id = $1" : ""}
     order by e.deleted_at desc nulls last`,
    filterEmployeeId ? [filterEmployeeId] : [],
  );

  const protectedActive = await client.query(
    `select count(*)::int as c from public.ai_employees
     where deleted_at is null and status in ('draft','published','disabled')`,
  );

  const candidates = [];
  for (const employee of archived.rows) {
    const dependencies = await countDependencies(client, employee.id, employee.company_id);
    const blockReasons = evaluateBlockers(employee, dependencies);
    candidates.push({
      employee,
      dependencies,
      blocked: blockReasons.length > 0,
      blockReasons,
    });
  }

  const eligible = candidates.filter((c) => !c.blocked);
  const blocked = candidates.filter((c) => c.blocked);
  const deletedEmployeeIds = [];

  if (execute) {
    await client.query("begin");
    try {
      for (const candidate of eligible) {
        const verify = await client.query(
          `select status, deleted_at from public.ai_employees
           where id=$1 and company_id=$2 and status='archived'
           for update`,
          [candidate.employee.id, candidate.employee.company_id],
        );
        if (verify.rows.length !== 1) {
          throw new Error(`Refusing purge: employee ${candidate.employee.id} is no longer eligible.`);
        }
        const deps = await countDependencies(
          client,
          candidate.employee.id,
          candidate.employee.company_id,
        );
        if (deps.active_workflows > 0) {
          throw new Error(
            `Refusing purge: employee ${candidate.employee.id} has active workflow references.`,
          );
        }
        await client.query(
          `delete from public.ai_employees
           where id=$1 and company_id=$2 and status='archived'`,
          [candidate.employee.id, candidate.employee.company_id],
        );
        deletedEmployeeIds.push(candidate.employee.id);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  const cascadeImpact = {
    ai_employee_versions: eligible.reduce((sum, c) => sum + c.dependencies.versions, 0),
    ai_employee_deployments: eligible.reduce((sum, c) => sum + c.dependencies.deployments, 0),
    ai_employee_change_events: eligible.reduce((sum, c) => sum + c.dependencies.change_events, 0),
    ai_employee_group_members: eligible.reduce((sum, c) => sum + c.dependencies.group_members, 0),
    ai_employee_handovers: eligible.reduce((sum, c) => sum + c.dependencies.handovers, 0),
  };

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        fkInventory: fkInventory.rows.map((row) => ({
          table: String(row.referencing_table),
          column: row.referencing_column,
          onDelete: onDeleteLabel(row.on_delete_action),
        })),
        totalArchivedSoftDeleted: archived.rows.length,
        eligibleCount: eligible.length,
        blockedCount: blocked.length,
        protectedActiveCount: protectedActive.rows[0]?.c ?? 0,
        cascadeImpact,
        eligible: eligible.map((c) => ({
          id: c.employee.id,
          name: c.employee.display_name || c.employee.name,
          companyId: c.employee.company_id,
          companyName: c.employee.company_name,
          createdAt: c.employee.created_at,
          deletedAt: c.employee.deleted_at,
          dependencies: c.dependencies,
        })),
        blocked: blocked.map((c) => ({
          id: c.employee.id,
          name: c.employee.display_name || c.employee.name,
          companyId: c.employee.company_id,
          companyName: c.employee.company_name,
          blockReasons: c.blockReasons,
          dependencies: c.dependencies,
        })),
        deletedEmployeeIds,
        summary: {
          eligibleForPermanentDeletion: eligible.length,
          blockedByDependenciesOrPolicy: blocked.length,
          protectedActiveEmployees: protectedActive.rows[0]?.c ?? 0,
          permanentlyDeletedThisRun: deletedEmployeeIds.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
