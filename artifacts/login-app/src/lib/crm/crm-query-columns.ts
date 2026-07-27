/** Shared Supabase column projections for CRM list queries (avoid select *). */

export const CUSTOMER_LIST_COLUMNS =
  "id, user_id, company_id, name, email, phone, age, gender, notes, created_at, updated_at";

export const INVOICE_LIST_COLUMNS = `
  id,
  user_id,
  customer_id,
  company_id,
  amount,
  status,
  invoice_date,
  created_at,
  updated_at,
  customers(id, name)
`;

export const LEGACY_BOOKING_LIST_COLUMNS = `
  id,
  user_id,
  customer_id,
  company_id,
  service,
  doctor_id,
  location_id,
  booking_date,
  duration_minutes,
  notes,
  status,
  created_at,
  updated_at,
  customers(id, name)
`;

export const SCHEDULING_BOOKING_LIST_COLUMNS = `
  id,
  company_id,
  customer_id,
  service_id,
  resource_id,
  branch_id,
  start_at,
  end_at,
  timezone,
  status,
  source,
  notes,
  rescheduled_from_id,
  version,
  created_by,
  updated_by,
  deleted_at,
  created_at,
  updated_at,
  customers(id, name),
  scheduling_services(id, name, duration_minutes),
  scheduling_resources(id, name)
`;
