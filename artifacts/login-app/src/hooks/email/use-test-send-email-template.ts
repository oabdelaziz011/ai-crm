import { useMutation } from "@tanstack/react-query";
import { testSendEmailTemplate } from "@/lib/notifications/providers/email/services/email-api-client";

export function useTestSendEmailTemplate(companyId: string | null) {
  return useMutation({
    mutationFn: (args: { templateId: string; recipientEmail: string }) => {
      if (!companyId) throw new Error("Company is required.");
      return testSendEmailTemplate({
        companyId,
        templateId: args.templateId,
        recipientEmail: args.recipientEmail,
      });
    },
  });
}
