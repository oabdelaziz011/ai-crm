import { supabase } from "@/lib/supabase";
import { getNotificationServices } from "@/lib/notifications";
import { OrganizationRepository } from "@/lib/organization/repositories/organization-repository";
import type { ComposerMention, ComposerMentionTarget } from "@/lib/omnichannel/types/composer-enterprise-types";

export function mentionHandle(label: string): string {
  return label.trim().replace(/\s+/g, "");
}

export function formatMentionToken(target: ComposerMentionTarget): string {
  return `@${target.handle}`;
}

export function parseMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(?:^|\s)@([\w\u0600-\u06FF.-]*)$/u);
  return match?.[1] ?? null;
}

export function extractMentionsFromText(
  text: string,
  targets: ComposerMentionTarget[],
): ComposerMention[] {
  const byHandle = new Map(targets.map((target) => [target.handle.toLowerCase(), target]));
  const found = new Map<string, ComposerMention>();
  const pattern = /@([\w\u0600-\u06FF.-]+)/gu;
  for (const match of text.matchAll(pattern)) {
    const handle = match[1]?.toLowerCase();
    if (!handle) continue;
    const target = byHandle.get(handle);
    if (!target) continue;
    found.set(target.id, {
      targetId: target.id,
      targetType: target.type,
      label: target.label,
      handle: target.handle,
    });
  }
  return [...found.values()];
}

export async function listComposerMentionTargets(companyId: string): Promise<ComposerMentionTarget[]> {
  const [{ data: profiles, error: profileError }, branchGroups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(50),
    new OrganizationRepository(supabase).listBranchGroups(companyId),
  ]);

  if (profileError) throw new Error(profileError.message);

  const agents: ComposerMentionTarget[] = (profiles ?? []).map((profile) => {
    const label = profile.full_name?.trim() || profile.email?.split("@")[0] || "Agent";
    return {
      id: profile.id as string,
      type: "agent" as const,
      label,
      handle: mentionHandle(label),
      online: true,
    };
  });

  const teams: ComposerMentionTarget[] = branchGroups.map((group) => ({
    id: group.id,
    type: "team" as const,
    label: group.name?.trim() || group.id,
    handle: mentionHandle(group.name?.trim() || "Team"),
    online: true,
  }));

  return [...agents, ...teams];
}

export function filterMentionTargets(
  targets: ComposerMentionTarget[],
  query: string | null,
): ComposerMentionTarget[] {
  if (!query) return targets.slice(0, 8);
  const normalized = query.toLowerCase();
  return targets
    .filter(
      (target) =>
        target.label.toLowerCase().includes(normalized)
        || target.handle.toLowerCase().includes(normalized),
    )
    .slice(0, 8);
}

export async function dispatchComposerMentions(input: {
  companyId: string;
  conversationId: string;
  messageId: string;
  actorUserId: string | null;
  actorName: string;
  mentions: ComposerMention[];
  canNotify: boolean;
}): Promise<void> {
  if (input.mentions.length === 0 || !input.canNotify) return;

  const agentMentions = input.mentions.filter((mention) => mention.targetType === "agent");
  if (agentMentions.length === 0) return;

  const notifications = getNotificationServices().notifications;
  await notifications.createNotification({
    companyId: input.companyId,
    event: "generic_system",
    recipients: agentMentions.map((mention) => ({
      userId: mention.targetId,
      companyId: input.companyId,
    })),
    params: {
      title: "Conversation mention",
      body: `${input.actorName} mentioned you in a conversation`,
      conversationId: input.conversationId,
      messageId: input.messageId,
    },
    priority: "high",
    channels: ["in_app"],
    userId: input.actorUserId,
  });

  await supabase.from("audit_logs").insert(
    agentMentions.map((mention) => ({
      company_id: input.companyId,
      user_id: input.actorUserId,
      action: "conversation.agent_mention",
      entity: "conversation",
      entity_id: input.conversationId,
      metadata: {
        mentionedUserId: mention.targetId,
        mentionedLabel: mention.label,
        messageId: input.messageId,
        source: "omnichannel_composer",
      },
    })),
  );
}
