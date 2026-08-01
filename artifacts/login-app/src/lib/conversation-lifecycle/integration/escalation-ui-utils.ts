import type { EscalationLevel } from "../types/lifecycle-types.js";

export type { EscalationLevel };

export const ESCALATION_LEVELS: EscalationLevel[] = [
  "agent",
  "team_leader",
  "supervisor",
  "manager",
  "admin",
];

export function nextEscalationLevel(current: EscalationLevel | null): EscalationLevel {
  if (!current) return "team_leader";
  const index = ESCALATION_LEVELS.indexOf(current);
  return ESCALATION_LEVELS[Math.min(index + 1, ESCALATION_LEVELS.length - 1)] ?? "team_leader";
}
