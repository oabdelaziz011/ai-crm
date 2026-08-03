import { supabase } from "@/lib/supabase";
import { createLoginAppIdentityPlatform } from "./identity-platform-factory.js";

let cached: ReturnType<typeof createLoginAppIdentityPlatform> | null = null;

export function getLoginAppIdentityPlatform() {
  if (!cached) cached = createLoginAppIdentityPlatform(supabase);
  return cached;
}

export async function resolveConversationIdentity(input: {
  companyId: string;
  actorUserId: string;
  conversationId: string;
  email?: string | null;
  phone?: string | null;
}) {
  return getLoginAppIdentityPlatform().conversations.resolveConversationIdentity(input);
}

export async function ensureLeadForConversation(input: {
  companyId: string;
  actorUserId: string;
  conversationId: string;
  title: string;
  contactName?: string;
  email?: string | null;
  phone?: string | null;
}) {
  const existing = await resolveConversationIdentity(input);
  if (existing.kind === "customer") return existing;
  if (existing.kind === "lead") return existing;

  return getLoginAppIdentityPlatform().conversations.ensureLeadForUnknownConversation({
    ...input,
    aiSummary: "Created from omnichannel conversation.",
  });
}
