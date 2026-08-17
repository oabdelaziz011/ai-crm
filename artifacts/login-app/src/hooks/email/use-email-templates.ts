import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import {
  emailTemplateRepository,
  type EmailTemplateInput,
} from "@/lib/email-templates";

export function emailTemplatesKey(companyId: string | null) {
  return ["email-templates", companyId] as const;
}

export function useEmailTemplates(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: emailTemplatesKey(companyId),
    enabled: Boolean(companyId) && enabled,
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => emailTemplateRepository.list(companyId!),
  });
}

export function useCreateEmailTemplate(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmailTemplateInput) => {
      if (!companyId) throw new Error("Company is required.");
      return emailTemplateRepository.create(companyId, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailTemplatesKey(companyId) });
    },
  });
}

export function useUpdateEmailTemplate(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: EmailTemplateInput }) => {
      if (!companyId) throw new Error("Company is required.");
      return emailTemplateRepository.update(companyId, args.id, args.input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailTemplatesKey(companyId) });
    },
  });
}

export function useSetEmailTemplateEnabled(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; enabled: boolean }) => {
      if (!companyId) throw new Error("Company is required.");
      return emailTemplateRepository.setEnabled(companyId, args.id, args.enabled);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailTemplatesKey(companyId) });
    },
  });
}

export function useDuplicateEmailTemplate(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      if (!companyId) throw new Error("Company is required.");
      return emailTemplateRepository.duplicate(companyId, id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailTemplatesKey(companyId) });
    },
  });
}

export function useDeleteEmailTemplate(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      if (!companyId) throw new Error("Company is required.");
      return emailTemplateRepository.remove(companyId, id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailTemplatesKey(companyId) });
    },
  });
}
