import { registerVariableResolver } from "../../logic/variable-resolver-registry.js";
import { LookupVariableResolver } from "./lookup-variable-resolver.js";

export function registerLookupVariableResolver(): void {
  registerVariableResolver(new LookupVariableResolver());
}
