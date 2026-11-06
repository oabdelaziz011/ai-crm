import { searchPattern } from "../lib/instance-url";

type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null; count?: number | null }>;

export type TenantQuery = {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): TenantQuery;
  eq(column: string, value: string): TenantQuery;
  ilike(column: string, pattern: string): TenantQuery;
  is(column: string, value: null): TenantQuery;
  order(column: string, options?: { ascending?: boolean }): TenantQuery;
  limit(count: number): TenantQuery;
  maybeSingle(): QueryResult<Record<string, unknown>>;
  then<TResult1 = { data: Record<string, unknown>[] | null; error: { message: string } | null; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[] | null; error: { message: string } | null; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
};

export type TenantClient = {
  from(table: string): TenantQuery;
};

export function requireCompanyId(companyId: string | null | undefined): string {
  if (!companyId) throw new Error("tenant_required");
  return companyId;
}

export function listCompanyRows(
  client: TenantClient,
  input: { table: string; companyId: string; columns: string; searchColumn?: string; search?: string; equals?: Record<string, string>; limit?: number },
) {
  const companyId = requireCompanyId(input.companyId);
  let query = client.from(input.table).select(input.columns).eq("company_id", companyId);
  for (const [column, value] of Object.entries(input.equals ?? {})) {
    query = query.eq(column, value);
  }
  const pattern = input.searchColumn ? searchPattern(input.search ?? "") : null;
  if (pattern && input.searchColumn) query = query.ilike(input.searchColumn, pattern);
  return query.order("created_at", { ascending: false }).limit(input.limit ?? 50);
}

export function companyRow(
  client: TenantClient,
  input: { table: string; companyId: string; id: string; columns: string },
) {
  const companyId = requireCompanyId(input.companyId);
  return client
    .from(input.table)
    .select(input.columns)
    .eq("company_id", companyId)
    .eq("id", input.id)
    .maybeSingle();
}
