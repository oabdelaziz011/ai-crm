import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession, useUser } from "@/context/auth-context";
import { CUSTOMER_LIST_COLUMNS } from "@/lib/crm/crm-query-columns";
import { CRM_ENRICHMENT_MAX_ROWS, CRM_LIST_MAX_ROWS, CRM_LIST_PAGE_SIZE } from "@/lib/crm/crm-list-config";
import {
  buildCustomerDeleteWarningAr,
  isCustomerDeleteBlockedByBookings,
  type CustomerDeleteDependencySummary,
} from "@/lib/customers-list/customer-delete-warning";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { flattenInfinitePages } from "@/lib/react-query/infinite-utils";
import type { Customer, CustomerInsert, CustomerUpdate } from "@/lib/types";
import { SIDEBAR_BADGES_KEY } from "@/hooks/use-sidebar-badge-counts";
import { customerKey } from "./use-customer";
import { buildCustomerPhoneIdentityColumns } from "@workspace/ai-tool-router";
import {
  didCustomerPhoneChange,
  validateCustomerPhoneFormInput,
} from "@/lib/customers/customer-phone-form";

export type { CustomerDeleteDependencySummary };
export { buildCustomerDeleteWarningAr, isCustomerDeleteBlockedByBookings };

export const CUSTOMERS_KEY = ["customers"] as const;

export function customersListKey(companyId: string | null | undefined) {
  return [...CUSTOMERS_KEY, companyId ?? "none"] as const;
}

export type CustomersPage = {
  rows: Customer[];
  nextOffset: number | null;
};

/** Localized CRM phone mutation errors (map codes → i18n keys in UI). */
export class CustomerPhoneMutationError extends Error {
  readonly code:
    | "phone_region_required"
    | "invalid_phone"
    | "duplicate_phone"
    | "phone_identity_unresolved"
    | "not_authenticated"
    | "company_required";

  constructor(
    code: CustomerPhoneMutationError["code"],
    message: string = code,
  ) {
    super(message);
    this.name = "CustomerPhoneMutationError";
    this.code = code;
  }
}

function mapPhoneWriteError(error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? "unknown";
  if (/phone_e164|company_phone_e164|idx_customers_company_phone/i.test(message)) {
    throw new CustomerPhoneMutationError("duplicate_phone", message);
  }
  throw new Error(message);
}

async function assertPhoneE164Available(input: {
  companyId: string;
  phoneE164: string;
  excludeCustomerId?: string;
}) {
  let query = supabase
    .from("customers")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("phone_e164", input.phoneE164)
    .limit(1);
  if (input.excludeCustomerId) {
    query = query.neq("id", input.excludeCustomerId);
  }
  const { data, error } = await query.maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }
  if (data?.id) {
    throw new CustomerPhoneMutationError("duplicate_phone");
  }
}

function resolveWritablePhoneIdentity(input: {
  phone: string | null | undefined;
  region: string | null | undefined;
  /** When false, empty phone is allowed (optional). When true and empty → clear identity. */
  allowEmpty: boolean;
}) {
  const validation = validateCustomerPhoneFormInput({
    phone: input.phone,
    region: input.region,
  });
  if (validation.code === "empty") {
    if (!input.allowEmpty) {
      throw new CustomerPhoneMutationError("invalid_phone");
    }
    return {
      phone: null as string | null,
      identity: buildCustomerPhoneIdentityColumns({ phone: null }),
    };
  }
  if (validation.code === "phone_region_required") {
    throw new CustomerPhoneMutationError("phone_region_required");
  }
  if (validation.code !== "ok" || !validation.identity?.phone_e164) {
    throw new CustomerPhoneMutationError(
      validation.code === "invalid_phone" ? "invalid_phone" : "phone_identity_unresolved",
    );
  }
  return {
    phone: (input.phone ?? "").trim() || null,
    identity: validation.identity,
  };
}

async function fetchCustomersPage(offset: number, limit: number): Promise<CustomersPage> {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Customer[];
  return {
    rows,
    nextOffset: rows.length < limit ? null : offset + limit,
  };
}

/** Bounded list for dashboards and cross-entity enrichment. */
export function useCustomers(maxRows = CRM_LIST_MAX_ROWS) {
  const { user } = useSession();
  const { profile } = useUser();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: [...customersListKey(companyId), "bounded", maxRows],
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Customer[]> => {
      const page = await fetchCustomersPage(0, maxRows);
      return page.rows;
    },
  });
}

/** Lightweight customer list for dropdowns and label enrichment. */
export function useCustomersEnrichment() {
  return useCustomers(CRM_ENRICHMENT_MAX_ROWS);
}

/** Infinite scroll for the customers list workspace. */
export function useCustomersInfinite(pageSize = CRM_LIST_PAGE_SIZE) {
  const { user } = useSession();
  const { profile } = useUser();
  const companyId = profile?.company_id ?? null;

  return useInfiniteQuery({
    queryKey: [...customersListKey(companyId), "infinite", pageSize],
    enabled: Boolean(user),
    staleTime: APP_QUERY_STALE_MS,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchCustomersPage(pageParam, pageSize),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

/** Flattened rows from useCustomersInfinite. */
export function useCustomersInfiniteRows(pageSize = CRM_LIST_PAGE_SIZE) {
  const query = useCustomersInfinite(pageSize);
  const rows = flattenInfinitePages(query.data?.pages.map((page) => page.rows));
  return { ...query, rows };
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  const { profile } = useUser();
  return useMutation({
    mutationFn: async (values: CustomerInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new CustomerPhoneMutationError("not_authenticated");
      const companyId = profile?.company_id ?? null;
      if (!companyId) throw new CustomerPhoneMutationError("company_required");

      const {
        phone_e164: _ignoreE164,
        phone_country_iso: regionFromForm,
        phone_region_source: _ignoreSource,
        phone_national: _ignoreNational,
        ...legacyValues
      } = values;

      const { phone, identity } = resolveWritablePhoneIdentity({
        phone: legacyValues.phone ?? null,
        region: regionFromForm ?? null,
        allowEmpty: true,
      });

      if (identity.phone_e164) {
        await assertPhoneE164Available({
          companyId,
          phoneE164: identity.phone_e164,
        });
      }

      const { data, error } = await supabase
        .from("customers")
        .insert({
          ...legacyValues,
          user_id: user.id,
          company_id: companyId,
          phone,
          ...identity,
        })
        .select()
        .single();
      if (error) mapPhoneWriteError(error);
      return data as Customer;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
      qc.invalidateQueries({ queryKey: customerKey(data.id) });
    },
  });
}

export type CustomerUpdateMutationInput = {
  id: string;
  values: CustomerUpdate;
  /** Required for phone-change detection when phone is in the patch. */
  previous?: Pick<Customer, "phone" | "phone_country_iso" | "phone_e164"> | null;
};

export function useUpdateCustomer() {
  const qc = useQueryClient();
  const { profile } = useUser();
  return useMutation({
    mutationFn: async ({ id, values, previous }: CustomerUpdateMutationInput) => {
      const companyId = profile?.company_id ?? null;
      const patch: CustomerUpdate = { ...values };

      // Strip identity columns from generic patches — only recompute when phone intentionally changes.
      delete (patch as { phone_e164?: unknown }).phone_e164;
      delete (patch as { phone_region_source?: unknown }).phone_region_source;
      delete (patch as { phone_national?: unknown }).phone_national;

      const phoneInPatch = Object.prototype.hasOwnProperty.call(values, "phone");
      if (phoneInPatch) {
        const nextPhone = values.phone ?? null;
        const nextRegion = values.phone_country_iso ?? previous?.phone_country_iso ?? null;
        const changed = didCustomerPhoneChange({
          previousPhone: previous?.phone,
          previousRegion: previous?.phone_country_iso,
          nextPhone,
          nextRegion,
        });

        if (!changed) {
          // Unrelated-looking phone resubmit with same values: do not recompute / clear identity.
          delete (patch as { phone?: unknown }).phone;
          delete (patch as { phone_country_iso?: unknown }).phone_country_iso;
        } else {
          const { phone, identity } = resolveWritablePhoneIdentity({
            phone: nextPhone,
            region: nextRegion,
            allowEmpty: true,
          });
          if (identity.phone_e164) {
            if (!companyId) throw new CustomerPhoneMutationError("company_required");
            await assertPhoneE164Available({
              companyId,
              phoneE164: identity.phone_e164,
              excludeCustomerId: id,
            });
          }
          Object.assign(patch, { phone, ...identity });
        }
      } else {
        // Non-phone edits must never clear identity via accidental phone_country_iso.
        delete (patch as { phone_country_iso?: unknown }).phone_country_iso;
      }

      const { data, error } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) mapPhoneWriteError(error);
      return data as Customer;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
      qc.invalidateQueries({ queryKey: customerKey(data.id) });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.id) {
        throw new Error("Customer delete was blocked or the customer was not found.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
    },
  });
}

/** Map mutation errors to i18n keys under forms.customer.* */
export function customerPhoneErrorI18nKey(error: unknown): string | null {
  if (error instanceof CustomerPhoneMutationError) {
    switch (error.code) {
      case "phone_region_required":
        return "forms.customer.phoneRegionRequired";
      case "invalid_phone":
      case "phone_identity_unresolved":
        return "forms.customer.invalidPhone";
      case "duplicate_phone":
        return "forms.customer.duplicatePhone";
      default:
        return null;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/phone_e164|company_phone_e164|idx_customers_company_phone/i.test(message)) {
    return "forms.customer.duplicatePhone";
  }
  return null;
}

/** Preflight counts for delete warnings — does not mutate. */
export async function fetchCustomerDeleteDependencies(
  customerId: string,
): Promise<CustomerDeleteDependencySummary> {
  const nowIso = new Date().toISOString();
  const [bookingsRes, futureRes, ticketsRes, blockingRes] = await Promise.all([
    supabase
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .is("deleted_at", null),
    supabase
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .in("status", ["pending", "confirmed"])
      .gte("start_at", nowIso),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .in("status", ["open", "in_progress", "waiting_customer"]),
    // FK ON DELETE RESTRICT blocks even soft-deleted booking rows.
    supabase
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId),
  ]);

  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (futureRes.error) throw new Error(futureRes.error.message);
  if (ticketsRes.error) throw new Error(ticketsRes.error.message);
  if (blockingRes.error) throw new Error(blockingRes.error.message);

  return {
    bookingCount: bookingsRes.count ?? 0,
    futureBookingCount: futureRes.count ?? 0,
    openTicketCount: ticketsRes.count ?? 0,
    blockingBookingCount: blockingRes.count ?? 0,
  };
}
