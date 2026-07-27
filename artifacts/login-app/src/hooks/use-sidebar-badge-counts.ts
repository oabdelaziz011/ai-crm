import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";

export const SIDEBAR_BADGES_KEY = ["sidebar-badges"] as const;

const BADGE_STALE_MS = 120_000;

async function countExact(table: string, filters: Array<[string, string, unknown]>) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, op, value] of filters) {
    if (op === "eq") query = query.eq(column, value as string);
    else if (op === "in") query = query.in(column, value as string[]);
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchPendingBookingsCount(companyId: string | null, userId: string) {
  const legacyPromise = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "Pending");

  const schedulingPromise = companyId
    ? supabase
        .from("scheduling_bookings")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending")
        .is("deleted_at", null)
    : Promise.resolve({ count: 0, error: null });

  const [legacy, scheduling] = await Promise.all([legacyPromise, schedulingPromise]);
  if (legacy.error) throw new Error(legacy.error.message);
  if (scheduling.error) throw new Error(scheduling.error.message);
  return (legacy.count ?? 0) + (scheduling.count ?? 0);
}

async function fetchUnpaidInvoicesCount() {
  return countExact("invoices", [["status", "in", ["Unpaid", "Overdue"]]]);
}

export interface SidebarBadgeCounts {
  customers?: number;
  bookings?: number;
  invoices?: number;
}

export function useSidebarBadgeCounts(options: {
  customers: boolean;
  bookings: boolean;
  invoices: boolean;
}) {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;
  const enabled = Boolean(userId);

  const customersQuery = useQuery({
    queryKey: [...SIDEBAR_BADGES_KEY, "customers", companyId],
    enabled: enabled && options.customers,
    staleTime: BADGE_STALE_MS,
    queryFn: () => countExact("customers", []),
  });

  const bookingsQuery = useQuery({
    queryKey: [...SIDEBAR_BADGES_KEY, "bookings", companyId, userId],
    enabled: enabled && options.bookings && Boolean(userId),
    staleTime: BADGE_STALE_MS,
    queryFn: () => fetchPendingBookingsCount(companyId, userId!),
  });

  const invoicesQuery = useQuery({
    queryKey: [...SIDEBAR_BADGES_KEY, "invoices", companyId],
    enabled: enabled && options.invoices,
    staleTime: BADGE_STALE_MS,
    queryFn: fetchUnpaidInvoicesCount,
  });

  const badgeCounts: SidebarBadgeCounts = {};
  if (options.customers && customersQuery.data !== undefined) {
    badgeCounts.customers = customersQuery.data;
  }
  if (options.bookings && bookingsQuery.data !== undefined) {
    badgeCounts.bookings = bookingsQuery.data;
  }
  if (options.invoices && invoicesQuery.data !== undefined) {
    badgeCounts.invoices = invoicesQuery.data;
  }

  return badgeCounts;
}
