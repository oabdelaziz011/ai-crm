import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import { NoShowEngine, NoShowRulesRepository } from "@/lib/scheduling/operations/automation";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";
import { invalidateOperationsQueries } from "@/lib/scheduling/operations/cache";

const bookingDomain = getBookingDomainServices();
const noShowRulesRepo = new NoShowRulesRepository(supabase);

export const NO_SHOW_RULES_KEY = ["scheduling-no-show-rules"] as const;

export function noShowRulesKey(companyId: string | null) {
  return [...NO_SHOW_RULES_KEY, companyId] as const;
}

export function useNoShowRules(companyId: string | null) {
  return useQuery({
    queryKey: noShowRulesKey(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: () => noShowRulesRepo.listByCompany(companyId!),
  });
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useMarkNoShowBooking(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      customerId?: string | null;
      gracePeriodMinutes?: number;
    }) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      const result = await bookingDomain.bookingDomain.markNoShowBooking({
        companyId,
        bookingId: input.bookingId,
        updatedBy: userId,
        gracePeriodMinutes: input.gracePeriodMinutes,
      });
      return result.booking;
    },
    onSuccess: (booking, variables) => {
      invalidateOperationsQueries(qc, {
        companyId,
        customerId: variables.customerId ?? booking.customer_id,
      });
    },
  });
}

/** Runs no-show evaluation on an interval while the operations center is mounted. */
export function useNoShowAutomation(
  companyId: string | null,
  bookings: OperationsBookingView[],
  enabled = true,
) {
  const { data: rules = [] } = useNoShowRules(companyId);
  const markNoShow = useMarkNoShowBooking(companyId);
  const pendingIdsRef = useRef(new Set<string>());
  const mutateRef = useRef(markNoShow.mutate);
  mutateRef.current = markNoShow.mutate;

  const evaluate = useCallback(() => {
    if (!companyId || rules.length === 0 || bookings.length === 0) return;

    const rulesMap = NoShowEngine.buildRulesMap(rules);
    const companyDefault = rules.find((r) => r.branchId === null) ?? null;
    const candidates = NoShowEngine.evaluate(bookings, rulesMap, companyDefault);

    for (const candidate of candidates) {
      if (pendingIdsRef.current.has(candidate.bookingId)) continue;
      const booking = bookings.find((b) => b.id === candidate.bookingId);
      if (!booking || booking.status !== "confirmed") continue;

      pendingIdsRef.current.add(candidate.bookingId);
      mutateRef.current(
        {
          bookingId: candidate.bookingId,
          customerId: booking.customerId,
          gracePeriodMinutes: candidate.gracePeriodMinutes,
        },
        {
          onSettled: () => {
            pendingIdsRef.current.delete(candidate.bookingId);
          },
        },
      );
    }
  }, [companyId, rules, bookings]);

  useEffect(() => {
    if (!enabled) return;
    evaluate();
    const timer = window.setInterval(evaluate, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, evaluate]);
}

/** Live clock tick for waiting queue timers (30s). */
export function useLiveTimer(intervalMs = 30_000): number {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return tick;
}
