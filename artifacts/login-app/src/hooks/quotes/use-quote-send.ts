import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { createQuoteEventBridge } from "@/lib/quote-platform/quote-platform-factory";
import {
  requestQuoteSend,
  requestQuoteSendOptions,
  type QuoteSendChannel,
} from "@/lib/quotes/quote-send-client";
import { classifyQuoteSendError, createQuoteSendKeyStore } from "@/lib/quotes/quote-send-ui";

export function useCanSendQuotes(): boolean {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  return isSuperAdmin || hasPermission("quotes.send");
}

export function useQuoteSendOptions(quoteId: string | null, enabled: boolean) {
  const { company } = useAuth();
  const canSend = useCanSendQuotes();
  return useQuery({
    queryKey: ["quote-send-options", company?.id ?? null, quoteId],
    enabled: Boolean(enabled && company?.id && quoteId && canSend),
    staleTime: 30_000,
    queryFn: async () => {
      if (!company?.id || !quoteId) throw new Error("Not authenticated");
      return requestQuoteSendOptions({ companyId: company.id, quoteId });
    },
  });
}

export function useSendQuote() {
  const { company, user } = useAuth();
  const qc = useQueryClient();
  const keys = useRef(createQuoteSendKeyStore()).current;

  return useMutation({
    mutationFn: async (input: { quoteId: string; channel: QuoteSendChannel; language?: string }) => {
      if (!company?.id) throw new Error("Not authenticated");
      const idempotencyKey = keys.acquire(input.quoteId, input.channel);
      try {
        const result = await requestQuoteSend({
          companyId: company.id,
          quoteId: input.quoteId,
          channel: input.channel,
          idempotencyKey,
          language: input.language,
        });
        keys.settle(input.quoteId, input.channel, "sent");
        return result;
      } catch (error) {
        keys.settle(input.quoteId, input.channel, classifyQuoteSendError(error));
        throw error;
      }
    },
    onSuccess: (result, input) => {
      if (result.quoteStatusUpdated && company?.id) {
        void createQuoteEventBridge()
          .publishSent({ quoteId: input.quoteId, companyId: company.id, actorUserId: user?.id ?? null })
          .catch(() => undefined);
      }
    },
    onSettled: (_result, _error, input) => {
      void qc.invalidateQueries({ queryKey: ["quotes-workspace"] });
      void qc.invalidateQueries({ queryKey: ["quote360-workspace"] });
      void qc.invalidateQueries({ queryKey: ["opportunity360-workspace"] });
      void qc.invalidateQueries({ queryKey: ["quote-send-options", company?.id ?? null, input.quoteId] });
    },
  });
}
