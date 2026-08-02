const RT = "[OMNI_SESSION_PROBE]";
export const OMNI_SESSION_TARGET_EMAIL = "oabdelaziz011@gmail.com";
export const VAULTOS_COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
export const DEMO_COMPANY_ID = "d0000010-0001-4001-8001-000000000002";

export type OmniAuthBootstrapProbe = {
  at: string;
  userEmail: string | null;
  profileCompanyId: string | null;
  companyId: string | null;
  companyName: string | null;
};

export type OmniListConversationsProbe = {
  at: string;
  companyId: string;
  userEmail: string | null;
  postgrestFilter: PostgrestListFilter;
};

export type PostgrestListFilter = {
  table: "conversations";
  select: "*";
  filters: Array<{ column: string; op: string; value: string | number | boolean | null }>;
  order: string[];
  limit: number | null;
  offset: number | null;
  range: { from: number; to: number } | null;
  sqlEquivalent: string;
};

export type OmniSessionProbeState = {
  authBootstrap: OmniAuthBootstrapProbe | null;
  listConversations: OmniListConversationsProbe[];
};

declare global {
  interface Window {
    __OMNI_SESSION_PROBE__?: OmniSessionProbeState;
  }
}

function ensureProbeState(): OmniSessionProbeState {
  if (typeof window === "undefined") {
    return { authBootstrap: null, listConversations: [] };
  }
  window.__OMNI_SESSION_PROBE__ ??= { authBootstrap: null, listConversations: [] };
  return window.__OMNI_SESSION_PROBE__;
}

export function buildPostgrestListFilter(input: {
  companyId: string;
  searchQuery?: string;
  state?: string;
  assignedUserId?: string | null;
  channelType?: string;
  priority?: string;
  hasEmployeeUnread?: boolean;
  hasCustomerUnread?: boolean;
  limit?: number;
  offset?: number;
}): PostgrestListFilter {
  const filters: PostgrestListFilter["filters"] = [
    { column: "company_id", op: "eq", value: input.companyId },
    { column: "deleted_at", op: "is", value: null },
  ];

  if (input.state) filters.push({ column: "state", op: "eq", value: input.state });
  if (input.channelType) filters.push({ column: "channel_type", op: "eq", value: input.channelType });
  if (input.priority) filters.push({ column: "priority", op: "eq", value: input.priority });
  if (input.hasEmployeeUnread) filters.push({ column: "unread_count_employee", op: "gt", value: 0 });
  if (input.hasCustomerUnread) filters.push({ column: "unread_count_customer", op: "gt", value: 0 });
  if (input.searchQuery?.trim()) {
    filters.push({ column: "search_text", op: "ilike", value: `%${input.searchQuery.trim()}%` });
  }
  if (input.assignedUserId !== undefined) {
    filters.push({
      column: "assigned_user_id",
      op: input.assignedUserId === null ? "is" : "eq",
      value: input.assignedUserId,
    });
  }

  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const range = input.offset != null ? { from: offset, to: offset + limit - 1 } : null;

  const where = filters
    .map((f) => {
      if (f.op === "is" && f.value === null) return `${f.column} IS NULL`;
      if (f.op === "ilike") return `${f.column} ILIKE '${f.value}'`;
      if (f.op === "gt") return `${f.column} > ${f.value}`;
      return `${f.column} = '${f.value}'`;
    })
    .join(" AND ");

  const sqlEquivalent = [
    "SELECT * FROM conversations",
    `WHERE ${where}`,
    "ORDER BY last_message_at DESC NULLS LAST, created_at DESC",
    range ? `LIMIT ${limit} OFFSET ${offset}` : input.limit != null ? `LIMIT ${limit}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    table: "conversations",
    select: "*",
    filters,
    order: ["last_message_at.desc.nullslast", "created_at.desc"],
    limit: input.limit ?? null,
    offset: input.offset ?? null,
    range,
    sqlEquivalent,
  };
}

/** Log once after INITIAL_SESSION auth bootstrap completes. */
export function logOmniAuthBootstrapOnce(input: {
  userEmail: string | null;
  profileCompanyId: string | null;
  companyId: string | null;
  companyName: string | null;
}): OmniAuthBootstrapProbe | null {
  const state = ensureProbeState();
  if (state.authBootstrap) return null;

  const entry: OmniAuthBootstrapProbe = {
    at: new Date().toISOString(),
    userEmail: input.userEmail,
    profileCompanyId: input.profileCompanyId,
    companyId: input.companyId,
    companyName: input.companyName,
  };

  state.authBootstrap = entry;
  console.info(RT, "authBootstrap", entry);
  return entry;
}

/** Log immediately before listConversations hits Supabase. */
export function logOmniListConversationsBeforeQuery(input: {
  companyId: string;
  userEmail: string | null;
  filter: Parameters<typeof buildPostgrestListFilter>[0];
}): OmniListConversationsProbe {
  const postgrestFilter = buildPostgrestListFilter(input.filter);
  const entry: OmniListConversationsProbe = {
    at: new Date().toISOString(),
    companyId: input.companyId,
    userEmail: input.userEmail,
    postgrestFilter,
  };

  const state = ensureProbeState();
  state.listConversations.push(entry);
  console.info(RT, "listConversations.beforeQuery", entry);
  return entry;
}

export function summarizeOmniSessionProbe(state: OmniSessionProbeState | undefined) {
  const auth = state?.authBootstrap ?? null;
  const lastList = state?.listConversations?.at(-1) ?? null;
  const authTenant = auth?.profileCompanyId ?? null;
  const listTenant = lastList?.companyId ?? null;
  return {
    authTenant,
    listTenant,
    sameTenant: authTenant !== null && listTenant !== null && authTenant === listTenant,
    authIsVaultos: authTenant === VAULTOS_COMPANY_ID,
    listIsVaultos: listTenant === VAULTOS_COMPANY_ID,
    authIsDemo: authTenant === DEMO_COMPANY_ID,
    listIsDemo: listTenant === DEMO_COMPANY_ID,
    targetEmail: OMNI_SESSION_TARGET_EMAIL,
    authEmailMatchesTarget: auth?.userEmail === OMNI_SESSION_TARGET_EMAIL,
    listEmailMatchesTarget: lastList?.userEmail === OMNI_SESSION_TARGET_EMAIL,
  };
}
