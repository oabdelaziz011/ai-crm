import type {
  ProductDemoBookingStatus,
  ProductDemoOfferingStatus,
  ProductDemoSlotStatus,
} from "./constants.js";

export type ProductDemoServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type ProductDemoOffering = {
  id: string;
  companyId: string;
  catalogProductId: string;
  title: string;
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;
  capacity: number;
  status: ProductDemoOfferingStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProductDemoPresenter = {
  id: string;
  companyId: string;
  offeringId: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
};

export type ProductDemoAvailabilityWindow = {
  id: string;
  companyId: string;
  offeringId: string;
  presenterUserId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  isActive: boolean;
};

export type ProductDemoSlot = {
  id: string;
  companyId: string;
  offeringId: string;
  catalogProductId: string;
  presenterUserId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: ProductDemoSlotStatus;
  capacity: number;
  bookedCount: number;
  publishedAt: string | null;
  blockedReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProductDemoBooking = {
  id: string;
  companyId: string;
  slotId: string;
  offeringId: string;
  catalogProductId: string;
  presenterUserId: string;
  customerId: string | null;
  leadId: string | null;
  conversationId: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  status: ProductDemoBookingStatus;
  clientRequestId: string | null;
  confirmationNumber: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BookableDemoSlot = {
  slotId: string;
  offeringId: string;
  catalogProductId: string;
  presenterUserId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  remainingCapacity: number;
};
