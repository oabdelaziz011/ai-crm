/**
 * Focused tests: ensure-root-env accepts injected process.env without writing
 * or printing secrets. Run: node --test scripts/ensure-root-env.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { loadProjectEnv, validateApiServerEnv } from "./lib/load-project-env.mjs";
import { ensureRootEnv, ROOT_ENV_LOAD_OPTIONS } from "./ensure-root-env.mjs";

const REQUIRED_KEYS = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const PROCESS_FIXTURE = Object.freeze({
  DATABASE_URL: "postgres://process-env:fixture@127.0.0.1:5432/process_db",
  SUPABASE_URL: "https://process-env.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "process-env-service-role-fixture",
});

const FILE_FIXTURE = Object.freeze({
  DATABASE_URL: "postgres://dotenv-file:fixture@127.0.0.1:5432/file_db",
  SUPABASE_URL: "https://dotenv-file.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "dotenv-file-service-role-fixture",
});

const EMPTY_ENV = `${REQUIRED_KEYS.map((key) => `${key}=`).join("\n")}\n`;

const SECRET_FIXTURES = [
  ...Object.values(PROCESS_FIXTURE),
  ...Object.values(FILE_FIXTURE),
];

const tempDirs = [];

function makeFixture({ envContent = EMPTY_ENV, exampleContent = EMPTY_ENV } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ensure-root-env-"));
  tempDirs.push(root);
  writeFileSync(join(root, ".env.example"), exampleContent);
  writeFileSync(join(root, ".env"), envContent);
  return root;
}

function envFileFrom(values) {
  return `${REQUIRED_KEYS.map((key) => `${key}=${values[key]}`).join("\n")}\n`;
}

function withProcessEnv(overrides, fn) {
  const previous = {};
  for (const key of REQUIRED_KEYS) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
  }
  try {
    for (const key of REQUIRED_KEYS) {
      if (overrides[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = overrides[key];
      }
    }
    return fn();
  } finally {
    for (const key of REQUIRED_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function captureLogs(fn) {
  const logs = [];
  const errors = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    return { result: fn(), logs, errors };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

function outputContainsSecret(outputChunks) {
  const output = outputChunks.join("\n");
  return SECRET_FIXTURES.some((secret) => output.includes(secret));
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ensure-root-env process.env bootstrap", { concurrency: false }, () => {
  it("passes validation from process.env when .env has empty placeholders", () => {
    const root = makeFixture({ envContent: EMPTY_ENV });

    const captured = withProcessEnv(PROCESS_FIXTURE, () =>
      captureLogs(() => ensureRootEnv(root)),
    );

    assert.equal(captured.result, 0);
    const env = withProcessEnv(PROCESS_FIXTURE, () =>
      loadProjectEnv(root, ROOT_ENV_LOAD_OPTIONS),
    );
    const validation = validateApiServerEnv(env);
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.missing, []);
    assert.equal(outputContainsSecret([...captured.logs, ...captured.errors]), false);

    const written = readFileSync(join(root, ".env"), "utf8");
    for (const secret of Object.values(PROCESS_FIXTURE)) {
      assert.equal(written.includes(secret), false);
    }
  });

  it("lets process.env take precedence over non-empty .env values", () => {
    const root = makeFixture({ envContent: envFileFrom(FILE_FIXTURE) });

    const env = withProcessEnv(PROCESS_FIXTURE, () =>
      loadProjectEnv(root, ROOT_ENV_LOAD_OPTIONS),
    );

    assert.equal(env.DATABASE_URL, PROCESS_FIXTURE.DATABASE_URL);
    assert.equal(env.SUPABASE_URL, PROCESS_FIXTURE.SUPABASE_URL);
    assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, PROCESS_FIXTURE.SUPABASE_SERVICE_ROLE_KEY);

    const captured = withProcessEnv(PROCESS_FIXTURE, () =>
      captureLogs(() => ensureRootEnv(root)),
    );
    assert.equal(captured.result, 0);
    assert.equal(outputContainsSecret([...captured.logs, ...captured.errors]), false);

    const written = readFileSync(join(root, ".env"), "utf8");
    assert.equal(written.includes(FILE_FIXTURE.DATABASE_URL), true);
    assert.equal(written.includes(PROCESS_FIXTURE.DATABASE_URL), false);
    assert.equal(written.includes(PROCESS_FIXTURE.SUPABASE_SERVICE_ROLE_KEY), false);
  });

  it("still accepts local .env values when process.env is unset", () => {
    const root = makeFixture({ envContent: envFileFrom(FILE_FIXTURE) });

    const captured = withProcessEnv({}, () => captureLogs(() => ensureRootEnv(root)));

    assert.equal(captured.result, 0);
    const env = withProcessEnv({}, () => loadProjectEnv(root, ROOT_ENV_LOAD_OPTIONS));
    assert.equal(env.DATABASE_URL, FILE_FIXTURE.DATABASE_URL);
    assert.equal(outputContainsSecret([...captured.logs, ...captured.errors]), false);
  });

  it("still fails when required values are missing from both sources", () => {
    const root = makeFixture({ envContent: EMPTY_ENV });

    const captured = withProcessEnv({}, () => captureLogs(() => ensureRootEnv(root)));

    assert.equal(captured.result, 1);
    assert.equal(outputContainsSecret([...captured.logs, ...captured.errors]), false);
    const help = captured.errors.join("\n");
    assert.match(help, /DATABASE_URL/);
    assert.match(help, /SUPABASE_URL/);
    assert.match(help, /SUPABASE_SERVICE_ROLE_KEY/);
  });
});
