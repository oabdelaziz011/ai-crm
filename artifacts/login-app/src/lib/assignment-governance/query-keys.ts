import type { AssignmentResource } from "@workspace/assignment-governance";

export const assignableEmployeeKeys = {
  all: ["assignable-employees"] as const,
  list: (input: {
    actorUserId: string | null | undefined;
    companyId: string | null | undefined;
    resource?: AssignmentResource | null;
    searchQuery?: string | null;
  }) =>
    [
      ...assignableEmployeeKeys.all,
      "list",
      input.actorUserId ?? "",
      input.companyId ?? "",
      input.resource ?? "any",
      input.searchQuery?.trim().toLowerCase() || "",
    ] as const,
};
