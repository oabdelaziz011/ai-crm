export const AGENTS_NESTED_PATH = "/agents";

export function agentDetailHref(agentId: string): string {
  return `${AGENTS_NESTED_PATH}/${agentId}`;
}

export function agentEditHref(agentId: string): string {
  return `${AGENTS_NESTED_PATH}/${agentId}/edit`;
}

export function agentNewHref(): string {
  return `${AGENTS_NESTED_PATH}/new`;
}
