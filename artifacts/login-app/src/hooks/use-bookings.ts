import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Booking, BookingInsert, BookingUpdate } from "@/lib/types";

export const BOOKINGS_KEY = ["bookings"] as const;

export function useBookings() {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: async (): Promise<Booking[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, customers(id, name)")
        .order("booking_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Booking[];
    },
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: BookingInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("bookings")
        .insert({ ...values, user_id: user.id })
        .select("*, customers(id, name)")
        .single();
      if (error) throw new Error(error.message);
      return data as Booking;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: BookingUpdate }) => {
      const { data, error } = await supabase
        .from("bookings")
        .update(values)
        .eq("id", id)
        .select("*, customers(id, name)")
        .single();
      if (error) throw new Error(error.message);
      return data as Booking;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  });
}

export function useDeleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  });
}
