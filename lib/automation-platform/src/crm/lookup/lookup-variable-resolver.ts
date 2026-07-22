import type { VariableResolver } from "../../logic/variable-resolver-registry.js";

const LOOKUP_FIELDS = new Set(["status", "count", "found"]);

export class LookupVariableResolver implements VariableResolver {
  readonly id = "crm.lookup.default";
  readonly namespace = "lookup";

  canResolve(segments: string[]): boolean {
    return segments.length === 2 && LOOKUP_FIELDS.has(segments[1]!);
  }

  resolve(segments: string[], variables: Record<string, unknown>): unknown {
    const lookup = variables.lookup;
    const field = segments[1];

    if (!field) return undefined;

    if (!lookup || typeof lookup !== "object" || Array.isArray(lookup)) {
      return field === "found" ? false : undefined;
    }

    const record = lookup as { status?: string; count?: number };

    switch (field) {
      case "status":
        return record.status;
      case "count":
        return record.count;
      case "found":
        return record.status === "found";
      default:
        return undefined;
    }
  }
}
