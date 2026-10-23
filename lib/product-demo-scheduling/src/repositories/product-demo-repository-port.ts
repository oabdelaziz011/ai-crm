import type {
  ProductDemoAvailabilityWindow,
  ProductDemoBooking,
  ProductDemoOffering,
  ProductDemoPresenter,
  ProductDemoSlot,
} from "../types.js";

export type CreateOfferingInput = {
  companyId: string;
  catalogProductId: string;
  title?: string;
  durationMinutes: number;
  bufferMinutes?: number;
  timezone: string;
  capacity?: number;
  createdBy: string | null;
};

export type CreateSlotInput = {
  companyId: string;
  offeringId: string;
  catalogProductId: string;
  presenterUserId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity: number;
  status?: "draft" | "published" | "blocked";
  createdBy: string | null;
};

export interface ProductDemoRepository {
  getCatalogProductInCompany(
    companyId: string,
    productId: string,
  ): Promise<{ id: string; companyId: string; name: string; isActive: boolean } | null>;

  getUserInCompany(
    companyId: string,
    userId: string,
  ): Promise<{ id: string; companyId: string } | null>;

  getOffering(companyId: string, offeringId: string): Promise<ProductDemoOffering | null>;
  getOfferingByProduct(
    companyId: string,
    catalogProductId: string,
  ): Promise<ProductDemoOffering | null>;
  listOfferings(
    companyId: string,
    input?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ items: ProductDemoOffering[]; total: number }>;
  createOffering(input: CreateOfferingInput): Promise<ProductDemoOffering>;
  updateOffering(
    companyId: string,
    offeringId: string,
    patch: Partial<{
      title: string;
      durationMinutes: number;
      bufferMinutes: number;
      timezone: string;
      capacity: number;
      status: ProductDemoOffering["status"];
      updatedBy: string | null;
    }>,
  ): Promise<ProductDemoOffering>;

  listPresenters(companyId: string, offeringId: string): Promise<ProductDemoPresenter[]>;
  upsertPresenter(input: {
    companyId: string;
    offeringId: string;
    userId: string;
    isActive?: boolean;
    createdBy: string | null;
  }): Promise<ProductDemoPresenter>;
  setPresenterActive(
    companyId: string,
    offeringId: string,
    userId: string,
    isActive: boolean,
  ): Promise<void>;

  listWindows(companyId: string, offeringId: string): Promise<ProductDemoAvailabilityWindow[]>;
  upsertWindow(input: {
    companyId: string;
    offeringId: string;
    presenterUserId?: string | null;
    weekday: number;
    startTime: string;
    endTime: string;
    timezone: string;
    isActive?: boolean;
    createdBy: string | null;
  }): Promise<ProductDemoAvailabilityWindow>;
  saveWeekdayWindow(input: {
    companyId: string;
    offeringId: string;
    presenterUserId?: string | null;
    weekday: number;
    startTime: string;
    endTime: string;
    timezone: string;
    createdBy: string | null;
  }): Promise<ProductDemoAvailabilityWindow>;
  deactivateWeekday(input: {
    companyId: string;
    offeringId: string;
    weekday: number;
    updatedBy: string | null;
  }): Promise<void>;

  getSlot(companyId: string, slotId: string): Promise<ProductDemoSlot | null>;
  listSlots(
    companyId: string,
    input: {
      offeringId?: string;
      catalogProductId?: string;
      status?: string | string[];
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    },
  ): Promise<{ items: ProductDemoSlot[]; total: number }>;
  createSlot(input: CreateSlotInput): Promise<ProductDemoSlot>;
  updateSlotStatus(
    companyId: string,
    slotId: string,
    status: ProductDemoSlot["status"],
    patch?: { blockedReason?: string | null; publishedAt?: string | null; updatedBy?: string | null },
  ): Promise<ProductDemoSlot>;
  findPresenterOverlap(input: {
    companyId: string;
    presenterUserId: string;
    startAt: string;
    endAt: string;
    excludeSlotId?: string;
  }): Promise<boolean>;

  listBookings(
    companyId: string,
    input: {
      catalogProductId?: string;
      customerId?: string;
      leadId?: string;
      presenterUserId?: string;
      status?: string | string[];
      from?: string;
      to?: string;
      query?: string;
      limit: number;
      offset: number;
    },
  ): Promise<{ items: ProductDemoBooking[]; total: number }>;
  getBooking(companyId: string, bookingId: string): Promise<ProductDemoBooking | null>;
  getBookingByClientRequestId(
    companyId: string,
    clientRequestId: string,
  ): Promise<ProductDemoBooking | null>;

  /** Atomic reserve via SQL function. Throws mapped domain errors. */
  reserveSlot(input: {
    companyId: string;
    slotId: string;
    customerId: string | null;
    leadId: string | null;
    conversationId: string | null;
    notes: string | null;
    clientRequestId: string | null;
    actorUserId: string | null;
  }): Promise<ProductDemoBooking>;

  cancelBooking(input: {
    companyId: string;
    bookingId: string;
    reason: string | null;
    actorUserId: string | null;
  }): Promise<ProductDemoBooking>;

  addHistory(input: {
    companyId: string;
    bookingId: string;
    eventType: string;
    summary: string;
    payload?: Record<string, unknown>;
    actorUserId: string | null;
  }): Promise<void>;
}
