export type Customer = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  company_id: string | null;
  full_name: string | null;
  is_super_admin: boolean;
};

export type BookingStatus = "Pending" | "Confirmed" | "Cancelled";
export type Booking = {
  id: string;
  user_id: string;
  customer_id: string | null;
  service: string;
  booking_date: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "id" | "name"> | null;
};

export type InvoiceStatus = "Unpaid" | "Paid" | "Overdue";
export type Invoice = {
  id: string;
  user_id: string;
  customer_id: string | null;
  amount: number;
  status: InvoiceStatus;
  invoice_date: string;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "id" | "name"> | null;
};

export type CustomerInsert = Omit<Customer, "id" | "user_id" | "created_at" | "updated_at">;
export type CustomerUpdate = Partial<CustomerInsert>;

export type ProfileInsert = Omit<Profile, "id">;
export type ProfileUpdate = Partial<ProfileInsert>;

export type BookingInsert = Omit<Booking, "id" | "user_id" | "created_at" | "updated_at" | "customers">;
export type BookingUpdate = Partial<BookingInsert>;

export type InvoiceInsert = Omit<Invoice, "id" | "user_id" | "created_at" | "updated_at" | "customers">;
export type InvoiceUpdate = Partial<InvoiceInsert>;
