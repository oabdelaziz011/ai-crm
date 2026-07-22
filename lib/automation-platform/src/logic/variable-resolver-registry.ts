import { traverseVariablePath } from "./variable-resolvers/default-variable-resolver.js";

export type VariableResolverRegistryState = "UNINITIALIZED" | "REGISTERING" | "FROZEN";

export interface VariableResolver {
  readonly id: string;
  readonly namespace: string;
  readonly priority?: number;
  canResolve(segments: string[]): boolean;
  resolve(segments: string[], variables: Record<string, unknown>): unknown;
}

const registry = new Map<string, VariableResolver[]>();
const registeredIds = new Set<string>();
const registrationOrder = new Map<string, number>();

let state: VariableResolverRegistryState = "UNINITIALIZED";
let registrationSequence = 0;

function compareResolvers(a: VariableResolver, b: VariableResolver): number {
  const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
  if (priorityDelta !== 0) return priorityDelta;
  return (registrationOrder.get(a.id) ?? 0) - (registrationOrder.get(b.id) ?? 0);
}

function assertRegistering(operation: string): void {
  if (state === "UNINITIALIZED") {
    throw new Error("Variable Resolver Registry has not entered registration mode.");
  }
  if (state === "FROZEN") {
    throw new Error("Variable Resolver Registry has already been frozen.");
  }
  void operation;
}

function assertReadable(operation: string): void {
  if (state === "UNINITIALIZED") {
    throw new Error("Variable Resolver Registry has not entered registration mode.");
  }
  void operation;
}

export function getVariableResolverRegistryState(): VariableResolverRegistryState {
  return state;
}

export function beginVariableResolverRegistration(): void {
  if (state === "REGISTERING") return;
  if (state === "FROZEN") {
    throw new Error("Variable Resolver Registry is already initialized.");
  }
  state = "REGISTERING";
}

export function registerVariableResolver(resolver: VariableResolver): void {
  assertRegistering("registerVariableResolver");

  if (registeredIds.has(resolver.id)) {
    return;
  }

  registeredIds.add(resolver.id);
  registrationOrder.set(resolver.id, registrationSequence++);

  const list = registry.get(resolver.namespace) ?? [];
  list.push(resolver);
  list.sort(compareResolvers);
  registry.set(resolver.namespace, list);
}

export function freezeVariableResolverRegistry(): void {
  assertRegistering("freezeVariableResolverRegistry");
  state = "FROZEN";
  for (const list of registry.values()) {
    Object.freeze(list);
  }
}

export function getVariableResolvers(namespace: string): readonly VariableResolver[] {
  assertReadable("getVariableResolvers");
  const list = registry.get(namespace);
  if (!list) return Object.freeze([]);
  if (state === "FROZEN") return list;
  return Object.freeze([...list]);
}

export function resolveViaRegistry(
  segments: string[],
  variables: Record<string, unknown>,
): unknown {
  if (state === "UNINITIALIZED") {
    return traverseVariablePath(segments, variables);
  }

  assertReadable("resolveViaRegistry");

  const resolvers = getVariableResolvers(segments[0] ?? "");
  for (const resolver of resolvers) {
    if (resolver.canResolve(segments)) {
      return resolver.resolve(segments, variables);
    }
  }

  return traverseVariablePath(segments, variables);
}

/** @internal Test-only reset. Not part of the public runtime API. */
export function resetVariableResolverRegistryForTests(): void {
  registry.clear();
  registeredIds.clear();
  registrationOrder.clear();
  registrationSequence = 0;
  state = "UNINITIALIZED";
}
