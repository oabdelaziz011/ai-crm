import type { AgentPresenceRecord, HandoffQueueRecord, QueueMemberRecord } from "../types/handoff-types.js";

export type QueueRoutingInput = {
  queue: HandoffQueueRecord;
  members: QueueMemberRecord[];
  presenceByUserId: Map<string, AgentPresenceRecord>;
  requiredSkills?: string[];
  requiredLanguage?: string;
  customerPriority?: string;
  isVip?: boolean;
};

const AVAILABLE_STATES = new Set(["online"]);

export function selectQueueAgent(input: QueueRoutingInput): QueueMemberRecord | null {
  const eligible = filterEligibleMembers(input);
  if (!eligible.length) return null;

  switch (input.queue.routingStrategy) {
    case "least_busy":
      return selectLeastBusy(eligible);
    case "skills_based":
      return selectSkillsBased(eligible, input.requiredSkills ?? []);
    case "language_routing":
      return selectLanguageMatch(eligible, input.requiredLanguage);
    case "priority_based":
    case "vip_routing":
      return selectPriorityBased(eligible, input.isVip ?? false);
    case "round_robin":
    default:
      return selectRoundRobin(eligible);
  }
}

function filterEligibleMembers(input: QueueRoutingInput): QueueMemberRecord[] {
  return input.members.filter((member) => {
    if (!member.isActive) return false;
    const presence = input.presenceByUserId.get(member.userId);
    if (!presence || !AVAILABLE_STATES.has(presence.state)) return false;
    return true;
  });
}

function selectRoundRobin(members: QueueMemberRecord[]): QueueMemberRecord {
  return [...members].sort((left, right) => {
    const leftTs = left.lastAssignedAt ? Date.parse(left.lastAssignedAt) : 0;
    const rightTs = right.lastAssignedAt ? Date.parse(right.lastAssignedAt) : 0;
    return leftTs - rightTs;
  })[0];
}

function selectLeastBusy(members: QueueMemberRecord[]): QueueMemberRecord {
  return [...members].sort((left, right) => {
    const countDiff = left.activeConversationCount - right.activeConversationCount;
    if (countDiff !== 0) return countDiff;
    const leftTs = left.lastAssignedAt ? Date.parse(left.lastAssignedAt) : 0;
    const rightTs = right.lastAssignedAt ? Date.parse(right.lastAssignedAt) : 0;
    if (leftTs !== rightTs) return leftTs - rightTs;
    return left.userId.localeCompare(right.userId);
  })[0];
}

function selectSkillsBased(members: QueueMemberRecord[], requiredSkills: string[]): QueueMemberRecord {
  if (!requiredSkills.length) return selectRoundRobin(members);
  const scored = members
    .map((member) => ({
      member,
      score: requiredSkills.filter((skill) => member.skills.includes(skill)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  return scored.length ? selectRoundRobin(scored.map((entry) => entry.member)) : selectRoundRobin(members);
}

function selectLanguageMatch(
  members: QueueMemberRecord[],
  requiredLanguage?: string,
): QueueMemberRecord {
  if (!requiredLanguage) return selectRoundRobin(members);
  const matched = members.filter((member) => member.languages.includes(requiredLanguage));
  return selectRoundRobin(matched.length ? matched : members);
}

function selectPriorityBased(members: QueueMemberRecord[], isVip: boolean): QueueMemberRecord {
  if (isVip) return selectLeastBusy(members);
  return selectRoundRobin(members);
}

export function estimateWaitTimeSeconds(queueSize: number, availableAgents: number): number {
  if (availableAgents <= 0) return queueSize * 120;
  return Math.round((queueSize / availableAgents) * 60);
}

export function isWithinBusinessHours(
  businessHours: Record<string, unknown>,
  now: Date = new Date(),
): boolean {
  if (!businessHours || Object.keys(businessHours).length === 0) return true;
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = days[now.getDay()] ?? "monday";
  const dayConfig = businessHours[day] as { enabled?: boolean; start?: string; end?: string } | undefined;
  if (!dayConfig || dayConfig.enabled === false) return false;
  if (!dayConfig.start || !dayConfig.end) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = dayConfig.start.split(":").map(Number);
  const [endH, endM] = dayConfig.end.split(":").map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  return current >= start && current <= end;
}
