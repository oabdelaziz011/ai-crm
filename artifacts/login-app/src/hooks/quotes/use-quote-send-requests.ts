import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanSendQuotes } from "@/hooks/quotes/use-quote-send";
import {
  approveQuoteSendRequest,
  listQuoteSendRequests,
  rejectQuoteSendRequest,
  type QuoteSendRequestItem,
} from "@/lib/quotes/quote-send-requests-api";
import type { QuoteSendChannel } from "@/lib/quotes/quote-send-types";
import { classifyQuoteSendError, createQuoteSendKeyStore } from "@/lib/quotes/quote-send-ui";
import { useRef } from "react";

export function quoteSendRequestsKey(companyId: string | null) {
  return ["quote-send-requests", companyId] as const;
}

export function useQuoteSendRequests(companyId: string | null) {
  const canSend = useCanSendQuotes();
  return useQuery({
    queryKey: quoteSendRequestsKey(companyId),
    enabled: Boolean(companyId && canSend),
    // Inbox is invalidated after approve/reject; avoid refetch-on-focus storms.
    staleTime: 15_000,
    queryFn: () => listQuoteSendRequests({ companyId: companyId! }),
  });
}

export function useQuoteSendRequestActions(companyId: string | null) {
  const qc = useQueryClient();
  const keys = useRef(createQuoteSendKeyStore()).current;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["quote-send-requests", companyId] });
    void qc.invalidateQueries({ queryKey: ["quotes-workspace"] });
    void qc.invalidateQueries({ queryKey: ["quote360-workspace"] });
  };

  const approve = useMutation({
    mutationFn: async (input: { quoteId: string; channel?: QuoteSendChannel }) => {
      if (!companyId) throw new Error("company required");
      const channel = input.channel ?? "email";
      const idempotencyKey = keys.acquire(input.quoteId, channel);
      try {
        const result = await approveQuoteSendRequest({
          companyId,
          quoteId: input.quoteId,
          channel,
          idempotencyKey,
        });
        keys.settle(input.quoteId, channel, result.sent ? "sent" : "failed");
        return result;
      } catch (error) {
        keys.settle(input.quoteId, channel, classifyQuoteSendError(error));
        throw error;
      }
    },
    onSuccess: invalidate,
    onError: invalidate,
  });

  const reject = useMutation({
    mutationFn: (input: { quoteId: string }) => {
      if (!companyId) throw new Error("company required");
      return rejectQuoteSendRequest({ companyId, quoteId: input.quoteId });
    },
    onSuccess: invalidate,
  });

  return { approve, reject };
}

export type { QuoteSendRequestItem };
