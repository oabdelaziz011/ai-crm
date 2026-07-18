import { supabase } from "@/lib/supabase";

let suppressAuthContextReload = false;

export function shouldSkipAuthContextReload(): boolean {
  return suppressAuthContextReload;
}

/**
 * Verifies the current password without triggering a full auth-context reload.
 * Used before in-session password changes.
 */
export async function verifyCurrentPassword(email: string, password: string) {
  suppressAuthContextReload = true;

  try {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    });
  } finally {
    suppressAuthContextReload = false;
  }
}

export async function updateAuthenticatedPassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}
