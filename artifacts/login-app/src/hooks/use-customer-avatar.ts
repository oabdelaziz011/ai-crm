import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/context/auth-context";
import {
  CustomerAvatarUploadError,
  removeAndPersistCustomerAvatar,
  uploadAndPersistCustomerAvatar,
} from "@/lib/customers/customer-avatar-upload";
import { CUSTOMERS_KEY } from "@/hooks/use-customers";
import { customerKey } from "@/hooks/use-customer";

export function useCustomerAvatarMutations() {
  const qc = useQueryClient();
  const { profile } = useUser();
  const companyId = profile?.company_id ?? null;

  const invalidate = (customerId: string) => {
    void qc.invalidateQueries({ queryKey: customerKey(customerId) });
    void qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
  };

  const upload = useMutation({
    mutationFn: async (input: {
      customerId: string;
      file: File;
      previousAvatarUrl?: string | null;
    }) => {
      if (!companyId) {
        throw new CustomerAvatarUploadError("company_required");
      }
      return uploadAndPersistCustomerAvatar({
        companyId,
        customerId: input.customerId,
        file: input.file,
        previousAvatarUrl: input.previousAvatarUrl,
      });
    },
    onSuccess: (_data, variables) => {
      invalidate(variables.customerId);
    },
  });

  const remove = useMutation({
    mutationFn: async (input: {
      customerId: string;
      previousAvatarUrl?: string | null;
    }) => {
      if (!companyId) {
        throw new CustomerAvatarUploadError("company_required");
      }
      await removeAndPersistCustomerAvatar({
        companyId,
        customerId: input.customerId,
        previousAvatarUrl: input.previousAvatarUrl,
      });
    },
    onSuccess: (_data, variables) => {
      invalidate(variables.customerId);
    },
  });

  return { upload, remove };
}
