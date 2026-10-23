import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveSalesFollowUpDraft,
  listSalesFollowUpDrafts,
  rejectSalesFollowUpDraft,
  rescheduleSalesFollowUpDraft,
  updateSalesFollowUpDraft,
  type SalesFollowUpReviewStatus,
} from "@/lib/sales-follow-up/sales-follow-up-drafts-api";

export function salesFollowUpDraftsKey(
  companyId: string | null,
  status: SalesFollowUpReviewStatus | "all",
) {
  return ["sales-follow-up-drafts", companyId, status] as const;
}

export function useSalesFollowUpDrafts(
  companyId: string | null,
  status: SalesFollowUpReviewStatus | "all" = "pending_review",
) {
  return useQuery({
    queryKey: salesFollowUpDraftsKey(companyId, status),
    enabled: Boolean(companyId),
    queryFn: () =>
      listSalesFollowUpDrafts({
        companyId: companyId!,
        status,
        limit: 75,
      }),
  });
}

export function useSalesFollowUpDraftActions(companyId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["sales-follow-up-drafts", companyId] });
  };

  const saveMessage = useMutation({
    mutationFn: (input: { jobId: string; messageText: string }) => {
      if (!companyId) throw new Error("company required");
      return updateSalesFollowUpDraft({ companyId, ...input });
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: (input: { jobId: string; messageText?: string }) => {
      if (!companyId) throw new Error("company required");
      return approveSalesFollowUpDraft({ companyId, ...input });
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: (input: { jobId: string; reason?: string }) => {
      if (!companyId) throw new Error("company required");
      return rejectSalesFollowUpDraft({ companyId, ...input });
    },
    onSuccess: invalidate,
  });

  const reschedule = useMutation({
    mutationFn: (input: { jobId: string; dueAt: string }) => {
      if (!companyId) throw new Error("company required");
      return rescheduleSalesFollowUpDraft({ companyId, ...input });
    },
    onSuccess: invalidate,
  });

  return { saveMessage, approve, reject, reschedule };
}
