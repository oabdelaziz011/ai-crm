export const PRODUCT_DEMO_PERMISSIONS = {
  view: "product_demos.view",
  manage: "product_demos.manage",
  book: "product_demos.book",
} as const;

export const PRODUCT_DEMO_OFFERING_STATUSES = ["draft", "published", "archived"] as const;
export const PRODUCT_DEMO_SLOT_STATUSES = [
  "draft",
  "published",
  "blocked",
  "booked",
  "cancelled",
] as const;
export const PRODUCT_DEMO_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "rescheduled",
] as const;

export type ProductDemoOfferingStatus = (typeof PRODUCT_DEMO_OFFERING_STATUSES)[number];
export type ProductDemoSlotStatus = (typeof PRODUCT_DEMO_SLOT_STATUSES)[number];
export type ProductDemoBookingStatus = (typeof PRODUCT_DEMO_BOOKING_STATUSES)[number];
