import type {
  PortalAppointmentFilter,
  PortalAuthMethod,
  PortalBookingStep,
  PortalDocumentType,
  PortalPaymentProviderCode,
  PortalSessionStatus,
} from "@/lib/customer-portal/types/portal-enums";

export type PortalBranding = {
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  faviconUrl: string | null;
  darkMode: boolean;
  customDomain: string | null;
};

export type PortalPublicProfile = {
  companyId: string;
  slug: string;
  name: string;
  description: string | null;
  timezone: string;
  enabled: boolean;
  branding: PortalBranding;
  workingHours: Record<string, { open: string; close: string } | null>;
  location: {
    address: string | null;
    city: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
  };
};

export type PortalServiceView = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
};

export type PortalResourceView = {
  id: string;
  name: string;
  type: string;
  specialty: string | null;
  experienceYears: number | null;
  profileImageUrl: string | null;
  rating: number | null;
  bio: string | null;
};

export type PortalSlotView = {
  startTime: string;
  endTime: string;
  available: boolean;
};

export type PortalCustomerInput = {
  name: string;
  email?: string | null;
  phone: string;
  preferredLanguage?: string;
  marketingConsent?: boolean;
};

export type PortalBookingRequest = {
  companyId: string;
  serviceId: string;
  resourceId: string;
  date: string;
  slotStart: string;
  customer: PortalCustomerInput;
  branchId?: string | null;
  notes?: string | null;
};

export type PortalBookingResult = {
  bookingId: string;
  customerId: string;
  status: string;
  startAt: string;
  endAt: string;
};

export type PortalSession = {
  id: string;
  customerId: string;
  companyId: string;
  status: PortalSessionStatus;
  expiresAt: string;
  token: string;
};

export type PortalAuthChallenge = {
  challengeId: string;
  method: PortalAuthMethod;
  expiresAt: string;
  maskedDestination: string;
};

export type PortalAppointmentView = {
  id: string;
  serviceName: string;
  resourceName: string;
  startAt: string;
  endAt: string;
  status: string;
  canReschedule: boolean;
  canCancel: boolean;
  canCheckIn: boolean;
  checkInToken: string | null;
};

export type PortalInvoiceView = {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string;
  paidAt: string | null;
  taxInfo: string | null;
};

export type PortalPaymentView = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: PortalPaymentProviderCode;
  createdAt: string;
  refundStatus: string | null;
};

export type PortalDocumentView = {
  id: string;
  type: PortalDocumentType;
  title: string;
  createdAt: string;
  downloadUrl: string | null;
  mimeType: string | null;
};

export type PortalProfileView = {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferredLanguage: string;
  marketingConsent: boolean;
  emergencyContact: string | null;
};

export type PortalAnalyticsSnapshot = {
  portalVisits: number;
  bookingConversionRate: number;
  onlineBookingPercent: number;
  cancellationRate: number;
  averageBookingTimeSeconds: number;
  satisfactionScore: number | null;
};

export type PortalBookingFlowState = {
  step: PortalBookingStep;
  serviceId: string | null;
  resourceId: string | null;
  date: string | null;
  slotStart: string | null;
  customer: PortalCustomerInput | null;
};

export type PortalPolicySnapshot = {
  minBookingNoticeMinutes: number;
  maxAdvanceBookingDays: number;
  minCancellationNoticeMinutes: number;
  minRescheduleNoticeMinutes: number;
  maxActiveBookingsPerCustomer: number;
  blackoutDates: string[];
};
