import type pg from "pg";

/** Companies that must never be touched by bulk archived cleanup. */
export const PROTECTED_COMPANY_NAME_PATTERNS = [
  /^cvp$/i,
  /nessma/i,
  /cvp/i,
] as const;

export type ArchivedEmployeeRow = {
  id: string;
  company_id: string;
  company_name: string | null;
  name: string;
  display_name: string;
  status: string;
  created_at: string;
  deleted_at: string;
};

export type ArchivedEmployeeDependencyCounts = {
  versions: number;
  deployments: number;
  change_events: number;
  group_members: number;
  handovers: number;
  collaboration_events: number;
  governance_audit: number;
  governance_approvals: number;
  conversations: number;
  active_workflows: number;
};

export type ArchivedEmployeeCleanupCandidate = {
  employee: ArchivedEmployeeRow;
  dependencies: ArchivedEmployeeDependencyCounts;
  blocked: boolean;
  blockReasons: string[];
};

export type ArchivedEmployeeCleanupDryRun = {
  totalArchivedSoftDeleted: number;
  eligible: ArchivedEmployeeCleanupCandidate[];
  blocked: ArchivedEmployeeCleanupCandidate[];
  protectedActiveCount: number;
  cascadeImpact: {
    ai_employee_versions: number;
    ai_employee_deployments: number;
    ai_employee_change_events: number;
    ai_employee_group_members: number;
    ai_employee_handovers: number;
  };
};

export type PermanentPurgeResult = {
  dryRun: ArchivedEmployeeCleanupDryRun;
  deletedEmployeeIds: string[];
  skippedEmployeeIds: string[];
};

function isProtectedCompanyName(name: string | null | undefined): boolean {
  const value = (name ?? "").trim();
  if (!value) return false;
  return PROTECTED_COMPANY_NAME_PATTERNS.some((pattern) => pattern.test(value));
}

/** Fail-closed eligibility: archived + soft-deleted only. */
export function isEligibleForPermanentPurge(row: {
  status: string;
  deleted_at: string | null;
}): boolean {
  return row.status === "archived" && row.deleted_at != null;
}

export function assertEligibleForPermanentPurge(row: {
  id: string;
  status: string;
  deleted_at: string | null;
}): void {
  if (!isEligibleForPermanentPurge(row)) {
    throw new Error(
      `Employee ${row.id} is not eligible for permanent purge (requires status=archived and deleted_at IS NOT NULL).`,
    );
  }
}

async function countDependencies(
  client: pg.Client,
  employeeId: string,
  companyId: string,
): Promise<ArchivedEmployeeDependencyCounts> {
  const queries = await Promise.all([
    client.query(
      `select count(*)::int as c from public.ai_employee_versions where employee_id=$1 and company_id=$2`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.ai_employee_deployments where employee_id=$1 and company_id=$2`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.ai_employee_change_events where employee_id=$1 and company_id=$2`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.ai_employee_group_members where employee_id=$1 and company_id=$2`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.ai_employee_handovers
       where company_id=$2 and (source_employee_id=$1 or destination_employee_id=$1)`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.ai_employee_collaboration_events
       where company_id=$2 and employee_id=$1`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.ai_governance_audit_events
       where company_id=$2 and employee_id=$1`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.ai_governance_approvals
       where company_id=$2 and entity_type='employee' and entity_id=$1`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.conversations
       where company_id=$2 and metadata->>'aiEmployeeId' = $1 and deleted_at is null`,
      [employeeId, companyId],
    ),
    client.query(
      `select count(*)::int as c from public.agent_workflows
       where company_id=$2
         and memory #>> '{executionState,pageContext,aiEmployeeId}' = $1
         and status in ('running','waiting_user','planning','paused')`,
      [employeeId, companyId],
    ),
  ]);

  return {
    versions: queries[0].rows[0]?.c ?? 0,
    deployments: queries[1].rows[0]?.c ?? 0,
    change_events: queries[2].rows[0]?.c ?? 0,
    group_members: queries[3].rows[0]?.c ?? 0,
    handovers: queries[4].rows[0]?.c ?? 0,
    collaboration_events: queries[5].rows[0]?.c ?? 0,
    governance_audit: queries[6].rows[0]?.c ?? 0,
    governance_approvals: queries[7].rows[0]?.c ?? 0,
    conversations: queries[8].rows[0]?.c ?? 0,
    active_workflows: queries[9].rows[0]?.c ?? 0,
  };
}

function evaluateBlockers(
  employee: ArchivedEmployeeRow,
  dependencies: ArchivedEmployeeDependencyCounts,
): string[] {
  const reasons: string[] = [];
  if (isProtectedCompanyName(employee.company_name)) {
    reasons.push("protected_company");
  }
  if (employee.status !== "archived") {
    reasons.push("status_not_archived");
  }
  if (!employee.deleted_at) {
    reasons.push("missing_deleted_at");
  }
  if (dependencies.active_workflows > 0) {
    reasons.push("active_workflow_reference");
  }
  return reasons;
}

export async function dryRunArchivedEmployeePermanentCleanup(
  client: pg.Client,
): Promise<ArchivedEmployeeCleanupDryRun> {
  const archived = await client.query<ArchivedEmployeeRow>(
    `select e.id, e.company_id, c.name as company_name, e.name, e.display_name, e.status,
            e.created_at, e.deleted_at
     from public.ai_employees e
     left join public.companies c on c.id = e.company_id
     where e.status = 'archived' and e.deleted_at is not null
     order by e.deleted_at desc`,
  );

  const protectedActive = await client.query<{ c: number }>(
    `select count(*)::int as c from public.ai_employees
     where deleted_at is null and status in ('draft','published','disabled')`,
  );

  const candidates: ArchivedEmployeeCleanupCandidate[] = [];
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

  const cascadeImpact = {
    ai_employee_versions: eligible.reduce((sum, c) => sum + c.dependencies.versions, 0),
    ai_employee_deployments: eligible.reduce((sum, c) => sum + c.dependencies.deployments, 0),
    ai_employee_change_events: eligible.reduce((sum, c) => sum + c.dependencies.change_events, 0),
    ai_employee_group_members: eligible.reduce((sum, c) => sum + c.dependencies.group_members, 0),
    ai_employee_handovers: eligible.reduce((sum, c) => sum + c.dependencies.handovers, 0),
  };

  return {
    totalArchivedSoftDeleted: archived.rows.length,
    eligible,
    blocked,
    protectedActiveCount: protectedActive.rows[0]?.c ?? 0,
    cascadeImpact,
  };
}

export async function permanentlyPurgeEligibleArchivedEmployees(
  client: pg.Client,
  options?: { employeeIds?: string[]; execute?: boolean },
): Promise<PermanentPurgeResult> {
  const dryRun = await dryRunArchivedEmployeePermanentCleanup(client);
  const idFilter = options?.employeeIds ? new Set(options.employeeIds) : null;

  const toDelete = dryRun.eligible.filter((c) =>
    idFilter ? idFilter.has(c.employee.id) : true,
  );

  const deletedEmployeeIds: string[] = [];
  const skippedEmployeeIds = [
    ...dryRun.blocked.map((c) => c.employee.id),
    ...dryRun.eligible
      .filter((c) => idFilter && !idFilter.has(c.employee.id))
      .map((c) => c.employee.id),
  ];

  if (!options?.execute) {
    return { dryRun, deletedEmployeeIds, skippedEmployeeIds };
  }

  await client.query("begin");
  try {
    for (const candidate of toDelete) {
      assertEligibleForPermanentPurge(candidate.employee);
      if (candidate.blocked) continue;

      const verify = await client.query<{ status: string; deleted_at: string | null }>(
        `select status, deleted_at from public.ai_employees where id=$1 and company_id=$2 for update`,
        [candidate.employee.id, candidate.employee.company_id],
      );
      const row = verify.rows[0];
      if (!row || !isEligibleForPermanentPurge(row)) {
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
        `delete from public.ai_employees where id=$1 and company_id=$2 and status='archived' and deleted_at is not null`,
        [candidate.employee.id, candidate.employee.company_id],
      );
      deletedEmployeeIds.push(candidate.employee.id);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  return { dryRun, deletedEmployeeIds, skippedEmployeeIds };
}
