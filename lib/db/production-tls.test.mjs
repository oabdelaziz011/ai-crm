import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { assertProductionDatabaseTls, productionDatabaseSsl } from "./src/production-tls.ts";

const require = createRequire(new URL("./package.json", import.meta.url));
const ConnectionParameters = require("pg/lib/connection-parameters");

const supabaseUrl = "postgres://role:secret@db.example.supabase.co:5432/postgres";

describe("production database TLS", () => {
  it("verifies Supabase hosts and refuses plaintext or no-verify", () => {
    const direct = productionDatabaseSsl(supabaseUrl);
    const pooler = productionDatabaseSsl("postgres://role@aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
    for (const ssl of [direct, pooler]) {
      assert.equal(ssl.rejectUnauthorized, true);
      const certificate = new X509Certificate(ssl.ca);
      assert.equal(certificate.subject, certificate.issuer);
      assert.match(certificate.subject, /Supabase Root 2021 CA/);
      assert.equal(
        certificate.fingerprint256,
        "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
      );
    }
    assert.equal(
      productionDatabaseSsl("postgres://role@db.example.supabase.co:5432/postgres?sslmode=verify-full"),
      undefined,
    );
    assert.equal(productionDatabaseSsl("postgres://role@db.example.supabase.co:5432/postgres?sslmode=require"), undefined);
    assert.doesNotThrow(() => assertProductionDatabaseTls(supabaseUrl));
    assert.throws(
      () => assertProductionDatabaseTls("postgres://role@db.internal.example:5432/postgres"),
      /verify-full/,
    );
    assert.throws(
      () => assertProductionDatabaseTls("postgres://role@db.example.supabase.co:5432/postgres?sslmode=no-verify"),
      /verify-full/,
    );
    assert.throws(
      () =>
        assertProductionDatabaseTls(
          "postgres://role@db.example.supabase.co:5432/postgres?sslmode=require&uselibpqcompat=true",
        ),
      /uselibpqcompat/,
    );
  });

  it("matches the installed pg parser", () => {
    const plain = new ConnectionParameters(supabaseUrl);
    assert.equal(plain.ssl, false);
    const forced = new ConnectionParameters({
      connectionString: supabaseUrl,
      ssl: productionDatabaseSsl(supabaseUrl),
    });
    assert.equal(forced.ssl.rejectUnauthorized, true);
    assert.match(new X509Certificate(forced.ssl.ca).subject, /Supabase Root 2021 CA/);
    const verified = new ConnectionParameters(`${supabaseUrl}?sslmode=verify-full`);
    assert.notEqual(verified.ssl, false);
    assert.notEqual(verified.ssl.rejectUnauthorized, false);
    const disabled = new ConnectionParameters(`${supabaseUrl}?sslmode=no-verify`);
    assert.equal(disabled.ssl.rejectUnauthorized, false);
  });
});
