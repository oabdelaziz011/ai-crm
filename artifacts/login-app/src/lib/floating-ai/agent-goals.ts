const AGENT_GOAL_PATTERNS = [
  /create\s+(a\s+)?customer|new\s+customer|add\s+customer/i,
  /duplicate|dedup|merge.*customer|find\s+duplicate/i,
  /import\s+(customer|list|csv|contacts)/i,
  /overdue\s+invoice|invoice.*overdue|unpaid\s+invoice/i,
  /inactive|not\s+contacted|no\s+contact|haven.?t\s+contacted/i,
  /summarize.*(customer|activity)|customer.*activity|activity\s+summary/i,
  /search\s+customer|find\s+customer|lookup\s+customer/i,
  /knowledge|onboarding|policy|faq|procedure|manual|documentation/i,
  /book\s+(an?\s+)?appointment|schedule/i,
  /search\s+(knowledge|documents|invoice)/i,
  /create\s+(an?\s+)?invoice/i,
  /run\s+workflow|execute\s+workflow|multi.?step/i,
];

const CRM_AGENT_GOAL_PATTERNS = AGENT_GOAL_PATTERNS.slice(0, 9);

export function isAgentGoal(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase().startsWith("/agent")) return true;
  return AGENT_GOAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isCrmAgentGoal(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return CRM_AGENT_GOAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function requiresAgentConfirmation(text: string): boolean {
  const trimmed = text.trim();
  return (
    /\bmerge\b/i.test(trimmed) ||
    /\bimport\b/i.test(trimmed) ||
    /\bbulk\s+(update|delete|remove)/i.test(trimmed) ||
    /\bdelete\b/i.test(trimmed) ||
    /\brefund\b/i.test(trimmed)
  );
}

export function normalizeAgentGoal(text: string): string {
  const trimmed = text.trim();
  if (trimmed.toLowerCase().startsWith("/agent")) {
    const remainder = trimmed.slice("/agent".length).trim();
    return remainder || trimmed;
  }
  return trimmed;
}
