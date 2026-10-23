import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  addProductDemoAvailabilityWindow,
  assignProductDemoPresenter,
  cancelProductDemoBooking,
  confirmProductDemoBooking,
  createProductDemoOffering,
  generateProductDemoSlots,
  listBookableProductDemoSlots,
  listProductDemoBookings,
  listProductDemoOfferings,
  listProductDemoSlots,
  listProductDemoWindows,
  setProductDemoWeekday,
  publishProductDemoSlot,
  setProductDemoOfferingStatus,
  unpublishProductDemoSlot,
  blockProductDemoSlot,
} from "@/lib/product-demos/product-demos-api";

const OFFERINGS_KEY = ["product-demos", "offerings"] as const;
const SLOTS_KEY = ["product-demos", "slots"] as const;
const BOOKINGS_KEY = ["product-demos", "bookings"] as const;
const BOOKABLE_KEY = ["product-demos", "bookable-slots"] as const;
const WINDOWS_KEY = ["product-demos", "windows"] as const;

export function useCanViewProductDemos() {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  return isSuperAdmin || hasPermission("product_demos.view");
}

export function useCanManageProductDemos() {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  return isSuperAdmin || hasPermission("product_demos.manage");
}

export function useCanBookProductDemos() {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  return isSuperAdmin || hasPermission("product_demos.book");
}

export function useProductDemoOfferings(enabled = true) {
  const canView = useCanViewProductDemos();
  return useQuery({
    queryKey: OFFERINGS_KEY,
    enabled: enabled && canView,
    queryFn: () => listProductDemoOfferings({ limit: 100 }),
  });
}

export function useProductDemoWindows(offeringId: string | null) {
  const canView = useCanViewProductDemos();
  return useQuery({
    queryKey: [...WINDOWS_KEY, offeringId],
    enabled: Boolean(offeringId) && canView,
    queryFn: () => listProductDemoWindows(offeringId!),
  });
}

export function useProductDemoSlots(
  filters?: { offeringId?: string; status?: string; limit?: number; offset?: number },
  enabled = true,
) {
  const canView = useCanViewProductDemos();
  return useQuery({
    queryKey: [...SLOTS_KEY, filters],
    enabled: enabled && canView,
    queryFn: () =>
      listProductDemoSlots({
        ...filters,
        limit: filters?.limit ?? 8,
        offset: filters?.offset ?? 0,
      }),
  });
}

export function useProductDemoBookings(
  filters?: { status?: string; query?: string },
  enabled = true,
) {
  const canView = useCanViewProductDemos();
  return useQuery({
    queryKey: [...BOOKINGS_KEY, filters],
    enabled: enabled && canView,
    queryFn: () => listProductDemoBookings({ ...filters, limit: 100 }),
  });
}

export function useBookableProductDemoSlots(catalogProductId: string | null) {
  const canView = useCanViewProductDemos();
  const canBook = useCanBookProductDemos();
  return useQuery({
    queryKey: [...BOOKABLE_KEY, catalogProductId],
    enabled: Boolean(catalogProductId) && (canView || canBook),
    queryFn: () =>
      listBookableProductDemoSlots({
        catalogProductId: catalogProductId!,
        limit: 200,
      }),
  });
}

export function useProductDemoMutations() {
  const qc = useQueryClient();
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["product-demos"] });
  };

  return {
    createOffering: useMutation({
      mutationFn: createProductDemoOffering,
      onSuccess: invalidateAll,
    }),
    assignPresenter: useMutation({
      mutationFn: ({
        offeringId,
        userId,
        isActive,
      }: {
        offeringId: string;
        userId: string;
        isActive?: boolean;
      }) => assignProductDemoPresenter(offeringId, { userId, isActive }),
      onSuccess: invalidateAll,
    }),
    setWeekday: useMutation({
      mutationFn: ({
        offeringId,
        ...body
      }: {
        offeringId: string;
        weekday: number;
        isWorkDay: boolean;
        startTime?: string;
        endTime?: string;
        presenterUserId?: string | null;
        timezone?: string;
      }) => setProductDemoWeekday(offeringId, body),
      onSuccess: invalidateAll,
    }),
    addWindow: useMutation({
      mutationFn: ({
        offeringId,
        ...body
      }: {
        offeringId: string;
        presenterUserId?: string | null;
        weekday: number;
        startTime: string;
        endTime: string;
        timezone?: string;
      }) => addProductDemoAvailabilityWindow(offeringId, body),
      onSuccess: invalidateAll,
    }),
    generateSlots: useMutation({
      mutationFn: ({
        offeringId,
        daysAhead,
        publish,
        dates,
      }: {
        offeringId: string;
        daysAhead?: number;
        publish?: boolean;
        dates?: string[];
      }) => generateProductDemoSlots(offeringId, { daysAhead, publish, dates }),
      onSuccess: invalidateAll,
    }),
    setOfferingStatus: useMutation({
      mutationFn: ({
        offeringId,
        status,
      }: {
        offeringId: string;
        status: "draft" | "published" | "archived";
      }) => setProductDemoOfferingStatus(offeringId, status),
      onSuccess: invalidateAll,
    }),
    publishSlot: useMutation({
      mutationFn: (slotId: string) => publishProductDemoSlot(slotId),
      onSuccess: invalidateAll,
    }),
    unpublishSlot: useMutation({
      mutationFn: (slotId: string) => unpublishProductDemoSlot(slotId),
      onSuccess: invalidateAll,
    }),
    blockSlot: useMutation({
      mutationFn: ({ slotId, reason }: { slotId: string; reason?: string }) =>
        blockProductDemoSlot(slotId, reason),
      onSuccess: invalidateAll,
    }),
    confirmBooking: useMutation({
      mutationFn: confirmProductDemoBooking,
      onSuccess: invalidateAll,
    }),
    cancelBooking: useMutation({
      mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
        cancelProductDemoBooking(bookingId, reason),
      onSuccess: invalidateAll,
    }),
  };
}
