import type { MockDataProvider } from "./mock-provider-registry";

export const customerProvider: MockDataProvider = {
  preset: "customer",
  label: "Customer profile",
  variables: {
    "customer.id": "cust-preview-001",
    "customer.name": "Preview Customer",
    "customer.phone": "+966500000000",
    "customer.email": "preview@example.com",
    "customer.locale": "en",
  },
};

export const bookingProvider: MockDataProvider = {
  preset: "booking",
  label: "Booking record",
  variables: {
    "booking.id": "booking-preview-001",
    "booking.status": "confirmed",
    "booking.service": "Premium consultation",
    "booking.starts_at": new Date().toISOString(),
  },
};

export const ticketProvider: MockDataProvider = {
  preset: "ticket",
  label: "Support ticket",
  variables: {
    "ticket.id": "ticket-preview-001",
    "ticket.subject": "Preview support ticket",
    "ticket.priority": "normal",
    "ticket.status": "open",
  },
};

export const paymentProvider: MockDataProvider = {
  preset: "payment",
  label: "Payment payload",
  variables: {
    "payment.id": "pay-preview-001",
    "payment.status": "paid",
    "payment.amount": 199,
    "payment.currency": "SAR",
  },
};

export const genericProvider: MockDataProvider = {
  preset: "custom",
  label: "Custom payload",
  variables: {},
};
