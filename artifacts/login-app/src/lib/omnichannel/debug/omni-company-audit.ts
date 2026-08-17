const VAULTOS = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const DEMO_TENANT = "d0000010-0001-4001-8001-000000000002";

export type OmniCompanyTraceInput = {
  companyId?: string | null;
  profileCompanyId?: string | null;
  companyRecordId?: string | null;
  userEmail?: string | null;
  userId?: string | null;
  extra?: Record<string, unknown>;
};

export type OmniCompanyLogEntry = {
  at: string;
  stage: string;
  companyId: string | null;
  profileCompanyId: string | null;
  companyRecordId: string | null;
  userEmail: string | null;
  userId: string | null;
  vaultosExpected: string;
  isVaultos: boolean;
  isDemoTenant: boolean;
  profileVsCompanyMismatch: boolean;
  changedFromVaultos: boolean;
  extra?: Record<string, unknown>;
};

declare global {
  interface Window {
    __OMNI_COMPANY_LOGS?: OmniCompanyLogEntry[];
    __OMNI_COMPANY_LAST_PROFILE?: string | null;
  }
}

function pushLog(entry: OmniCompanyLogEntry) {
  // Keep traces in window for debugging; avoid console noise on auth pages.
  if (typeof window !== "undefined") {
    window.__OMNI_COMPANY_LOGS ??= [];
    window.__OMNI_COMPANY_LOGS.push(entry);
    if (window.localStorage?.getItem("OMNI_COMPANY_DEBUG") === "1") {
      console.info("[OMNI_COMPANY]", entry.stage, {
        companyId: entry.companyId,
        profileCompanyId: entry.profileCompanyId,
        companyRecordId: entry.companyRecordId,
        userEmail: entry.userEmail,
        changedFromVaultos: entry.changedFromVaultos,
        profileVsCompanyMismatch: entry.profileVsCompanyMismatch,
        ...(entry.extra ?? {}),
      });
    }
  }
}

/** Trace companyId at each pipeline stage; flags first VaultOS → demo-tenant drift. */
export function omniCompanyTrace(stage: string, input: OmniCompanyTraceInput): OmniCompanyLogEntry {
  const profileCompanyId = input.profileCompanyId ?? input.companyId ?? null;
  const companyRecordId = input.companyRecordId ?? null;
  const companyId = input.companyId ?? profileCompanyId;

  const prevProfile = typeof window !== "undefined" ? window.__OMNI_COMPANY_LAST_PROFILE ?? null : null;
  const changedFromVaultos =
    prevProfile === VAULTOS
    && profileCompanyId !== null
    && profileCompanyId !== VAULTOS;

  if (typeof window !== "undefined" && profileCompanyId) {
    window.__OMNI_COMPANY_LAST_PROFILE = profileCompanyId;
  }

  const entry: OmniCompanyLogEntry = {
    at: new Date().toISOString(),
    stage,
    companyId,
    profileCompanyId,
    companyRecordId,
    userEmail: input.userEmail ?? null,
    userId: input.userId ?? null,
    vaultosExpected: VAULTOS,
    isVaultos: profileCompanyId === VAULTOS,
    isDemoTenant: profileCompanyId === DEMO_TENANT,
    profileVsCompanyMismatch:
      profileCompanyId !== null
      && companyRecordId !== null
      && profileCompanyId !== companyRecordId,
    changedFromVaultos,
    extra: input.extra,
  };

  pushLog(entry);
  return entry;
}

export function diagnoseCompanyPipeline(logs: OmniCompanyLogEntry[]) {
  const firstWrong = logs.find((l) => l.profileCompanyId === DEMO_TENANT || l.isDemoTenant);
  const firstVaultos = logs.find((l) => l.profileCompanyId === VAULTOS);
  const firstDrift = logs.find((l) => l.changedFromVaultos);
  const firstMismatch = logs.find((l) => l.profileVsCompanyMismatch);
  return { firstWrong, firstVaultos, firstDrift, firstMismatch, logCount: logs.length };
}
