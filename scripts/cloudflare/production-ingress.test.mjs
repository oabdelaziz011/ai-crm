import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  productionIngressProblems,
  renderProductionTunnelConfig,
} from "./production-ingress.mjs";

const source = `
tunnel: example
ingress:
  - hostname: webhook.valueor.org
    service: http://localhost:3000
  - service: http_status:404
`;

describe("production tunnel ingress", () => {
  it("rejects loopback for the production webhook hostname", () => {
    const problems = productionIngressProblems(source);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /webhook\.valueor\.org/);
  });

  it("renders a non-loopback origin and accepts it", () => {
    const rendered = renderProductionTunnelConfig(source, "https://api.valueor.internal:3000");
    assert.match(rendered, /service:\s*https:\/\/api\.valueor\.internal:3000/);
    assert.deepEqual(productionIngressProblems(rendered), []);
  });

  it("refuses to point the production hostname at loopback", () => {
    assert.throws(
      () => renderProductionTunnelConfig(source, "http://127.0.0.1:3000"),
      /must not be loopback/,
    );
  });
});
