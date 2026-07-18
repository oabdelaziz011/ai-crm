/**
 * Validates AuthContext sequence-guard hardening against concurrent load races.
 * Mirrors loadGenerationRef / isStale() semantics from auth-context.tsx.
 *
 * Run: tsx scripts/auth-context-concurrent-load-validation.mts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const AUTH_CONTEXT_PATH = resolve(root, "artifacts/login-app/src/context/auth-context.tsx");

type Result = { scenario: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, ok: boolean, detail: string) {
  results.push({ scenario, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${scenario} — ${detail}`);
}

/** Mirrors AuthProvider loadGenerationRef + invalidateInFlightAuthLoads + isStale */
function createAuthLoadGuard() {
  let loadGeneration = 0;

  return {
    invalidateInFlightAuthLoads() {
      loadGeneration += 1;
    },
    beginLoad() {
      return ++loadGeneration;
    },
    isStale(generation: number) {
      return generation !== loadGeneration;
    },
    currentGeneration() {
      return loadGeneration;
    },
  };
}

type AuthSnapshot = {
  profile: string | null;
  company: string | null;
  roles: string[];
  permissions: string[];
  isLoading: boolean;
  loadedUserId: string | null;
};

type LoadPayload = {
  label: string;
  userId: string;
  profile: string;
  company: string;
  roles: string[];
  permissions: string[];
  showLoading: boolean;
  /** Artificial delay before each phase completes (ms) */
  delays: { profile: number; company: number; roles: number; permissions: number };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulates loadAuthContext with the same generation checkpoints as production.
 * Returns whether this load committed state (false when stale).
 */
async function simulateLoadAuthContext(
  guard: ReturnType<typeof createAuthLoadGuard>,
  state: AuthSnapshot,
  payload: LoadPayload,
): Promise<boolean> {
  const generation = guard.beginLoad();
  const isStale = () => guard.isStale(generation);

  if (payload.showLoading && !isStale()) {
    state.isLoading = true;
  }

  try {
    await sleep(payload.delays.profile);
    if (isStale()) {
      return false;
    }
    state.profile = payload.profile;

    await sleep(payload.delays.company);
    if (isStale()) {
      return false;
    }
    state.company = payload.company;

    await sleep(payload.delays.roles);
    if (isStale()) {
      return false;
    }
    state.roles = payload.roles;

    await sleep(payload.delays.permissions);
    if (isStale()) {
      return false;
    }
    state.permissions = payload.permissions;
    state.loadedUserId = payload.userId;
  } finally {
    if (!isStale()) {
      state.isLoading = false;
    }
  }

  return true;
}

function assertSnapshot(
  state: AuthSnapshot,
  expected: AuthSnapshot,
  staleCommits: number,
): { ok: boolean; detail: string } {
  const mismatches: string[] = [];
  if (state.profile !== expected.profile) mismatches.push(`profile=${state.profile} expected=${expected.profile}`);
  if (state.company !== expected.company) mismatches.push(`company=${state.company} expected=${expected.company}`);
  if (JSON.stringify(state.roles) !== JSON.stringify(expected.roles)) {
    mismatches.push(`roles=${state.roles.join(",")} expected=${expected.roles.join(",")}`);
  }
  if (JSON.stringify(state.permissions) !== JSON.stringify(expected.permissions)) {
    mismatches.push(`permissions=${state.permissions.join(",")} expected=${expected.permissions.join(",")}`);
  }
  if (state.isLoading !== expected.isLoading) mismatches.push(`isLoading=${state.isLoading} expected=${expected.isLoading}`);
  if (state.loadedUserId !== expected.loadedUserId) {
    mismatches.push(`loadedUserId=${state.loadedUserId} expected=${expected.loadedUserId}`);
  }
  if (staleCommits !== 0) mismatches.push(`staleCommits=${staleCommits} expected=0`);

  return {
    ok: mismatches.length === 0,
    detail: mismatches.length ? mismatches.join("; ") : "newest load committed; stale loads suppressed",
  };
}

async function runConcurrentScenario(
  scenario: string,
  loads: LoadPayload[],
  expectedWinner: LoadPayload,
) {
  const guard = createAuthLoadGuard();
  const state: AuthSnapshot = {
    profile: null,
    company: null,
    roles: [],
    permissions: [],
    isLoading: false,
    loadedUserId: null,
  };

  const commitResults = await Promise.all(loads.map((load) => simulateLoadAuthContext(guard, state, load)));
  const staleCommits = commitResults.filter(Boolean).length - 1;

  const expected: AuthSnapshot = {
    profile: expectedWinner.profile,
    company: expectedWinner.company,
    roles: expectedWinner.roles,
    permissions: expectedWinner.permissions,
    isLoading: false,
    loadedUserId: expectedWinner.userId,
  };

  const { ok, detail } = assertSnapshot(state, expected, staleCommits);
  record(scenario, ok, detail);
}

function verifySourceGuardImplementation() {
  const source = readFileSync(AUTH_CONTEXT_PATH, "utf8");
  const checks: Array<{ name: string; ok: boolean }> = [
    { name: "loadGenerationRef declared", ok: /loadGenerationRef\s*=\s*useRef\(0\)/.test(source) },
    { name: "invalidateInFlightAuthLoads helper", ok: /invalidateInFlightAuthLoads/.test(source) },
    { name: "generation captured at load start", ok: /const generation = \+\+loadGenerationRef\.current/.test(source) },
    { name: "isStale closure", ok: /const isStale = \(\) => generation !== loadGenerationRef\.current/.test(source) },
    { name: "profile guarded", ok: /setProfile\(nextProfile\)/.test(source) && source.includes("if (isStale())") },
    { name: "permissions guarded", ok: /setPermissions\(nextPermissions\)/.test(source) },
    { name: "loading guarded in finally", ok: /if \(!isStale\(\)\) \{\s*\n\s*setIsLoading\(false\)/.test(source) },
    { name: "SIGNED_OUT invalidates in-flight", ok: /SIGNED_OUT[\s\S]*invalidateInFlightAuthLoads\(\)/.test(source) },
    { name: "signOut invalidates in-flight", ok: /signOut[\s\S]*invalidateInFlightAuthLoads\(\)/.test(source) },
    { name: "no mutex / lock primitive", ok: !/\b(mutex|semaphore)\b|\.lock\(|acquireLock|withLock/i.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")) },
  ];

  for (const check of checks) {
    record(`Source guard — ${check.name}`, check.ok, check.ok ? "present" : "missing in auth-context.tsx");
  }
}

async function main() {
  console.log("AuthContext Concurrent Load — Sequence Guard Validation\n");

  verifySourceGuardImplementation();

  const userId = "user-abc";

  // Slow INITIAL_SESSION vs fast TOKEN_REFRESHED — refresh must win
  await runConcurrentScenario(
    "INITIAL_SESSION + TOKEN_REFRESHED overlap (newest wins)",
    [
      {
        label: "INITIAL_SESSION",
        userId,
        profile: "profile-initial",
        company: "company-initial",
        roles: ["role-old"],
        permissions: ["perm-old"],
        showLoading: true,
        delays: { profile: 40, company: 40, roles: 40, permissions: 40 },
      },
      {
        label: "TOKEN_REFRESHED",
        userId,
        profile: "profile-refreshed",
        company: "company-refreshed",
        roles: ["role-new"],
        permissions: ["perm-new", "perm-extra"],
        showLoading: false,
        delays: { profile: 5, company: 5, roles: 5, permissions: 5 },
      },
    ],
    {
      label: "TOKEN_REFRESHED",
      userId,
      profile: "profile-refreshed",
      company: "company-refreshed",
      roles: ["role-new"],
      permissions: ["perm-new", "perm-extra"],
      showLoading: false,
      delays: { profile: 5, company: 5, roles: 5, permissions: 5 },
    },
  );

  // refreshAuthContext racing with SIGNED_IN — SIGNED_IN (started last) wins
  await runConcurrentScenario(
    "refreshAuthContext() + SIGNED_IN overlap (newest wins)",
    [
      {
        label: "refreshAuthContext",
        userId,
        profile: "profile-refresh",
        company: "company-refresh",
        roles: ["role-refresh"],
        permissions: ["perm-refresh"],
        showLoading: false,
        delays: { profile: 30, company: 30, roles: 30, permissions: 30 },
      },
      {
        label: "SIGNED_IN",
        userId,
        profile: "profile-signed-in",
        company: "company-signed-in",
        roles: ["role-signed-in"],
        permissions: ["perm-signed-in"],
        showLoading: true,
        delays: { profile: 10, company: 10, roles: 10, permissions: 10 },
      },
    ],
    {
      label: "SIGNED_IN",
      userId,
      profile: "profile-signed-in",
      company: "company-signed-in",
      roles: ["role-signed-in"],
      permissions: ["perm-signed-in"],
      showLoading: true,
      delays: { profile: 10, company: 10, roles: 10, permissions: 10 },
    },
  );

  // Four simultaneous triggers — only the last-started load commits
  const quadWinner: LoadPayload = {
    label: "refreshAuthContext-last",
    userId,
    profile: "profile-quad-4",
    company: "company-quad-4",
    roles: ["role-quad-4"],
    permissions: ["perm-quad-4"],
    showLoading: false,
    delays: { profile: 8, company: 8, roles: 8, permissions: 8 },
  };

  await runConcurrentScenario(
    "INITIAL_SESSION + TOKEN_REFRESHED + refreshAuthContext + SIGNED_IN simultaneous",
    [
      {
        label: "INITIAL_SESSION",
        userId,
        profile: "profile-quad-1",
        company: "company-quad-1",
        roles: ["role-quad-1"],
        permissions: ["perm-quad-1"],
        showLoading: true,
        delays: { profile: 50, company: 50, roles: 50, permissions: 50 },
      },
      {
        label: "TOKEN_REFRESHED",
        userId,
        profile: "profile-quad-2",
        company: "company-quad-2",
        roles: ["role-quad-2"],
        permissions: ["perm-quad-2"],
        showLoading: false,
        delays: { profile: 35, company: 35, roles: 35, permissions: 35 },
      },
      {
        label: "SIGNED_IN",
        userId,
        profile: "profile-quad-3",
        company: "company-quad-3",
        roles: ["role-quad-3"],
        permissions: ["perm-quad-3"],
        showLoading: true,
        delays: { profile: 20, company: 20, roles: 20, permissions: 20 },
      },
      quadWinner,
    ],
    quadWinner,
  );

  // clear/invalidate between loads — stale slow load must not repopulate after clear
  {
    const guard = createAuthLoadGuard();
    const state: AuthSnapshot = {
      profile: null,
      company: null,
      roles: [],
      permissions: [],
      isLoading: false,
      loadedUserId: null,
    };

    const slowLoad = simulateLoadAuthContext(guard, state, {
      label: "INITIAL_SESSION-slow",
      userId,
      profile: "profile-stale-after-clear",
      company: "company-stale",
      roles: ["role-stale"],
      permissions: ["perm-stale"],
      showLoading: true,
      delays: { profile: 60, company: 0, roles: 0, permissions: 0 },
    });

    await sleep(10);
    guard.invalidateInFlightAuthLoads();
    state.profile = null;
    state.company = null;
    state.roles = [];
    state.permissions = [];
    state.loadedUserId = null;

    const fastLoad = simulateLoadAuthContext(guard, state, {
      label: "SIGNED_IN-fast",
      userId,
      profile: "profile-after-clear",
      company: "company-after-clear",
      roles: ["role-after-clear"],
      permissions: ["perm-after-clear"],
      showLoading: true,
      delays: { profile: 5, company: 5, roles: 5, permissions: 5 },
    });

    const [slowCommitted, fastCommitted] = await Promise.all([slowLoad, fastLoad]);
    const expected: AuthSnapshot = {
      profile: "profile-after-clear",
      company: "company-after-clear",
      roles: ["role-after-clear"],
      permissions: ["perm-after-clear"],
      isLoading: false,
      loadedUserId: userId,
    };
    const staleCommits = (slowCommitted ? 1 : 0) + (fastCommitted ? 1 : 0) - 1;
    const { ok, detail } = assertSnapshot(state, expected, staleCommits);
    record("invalidate before reload — stale slow load cannot repopulate", ok, detail);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
