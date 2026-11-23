#!/usr/bin/env node
/**
 * Switch Contabo API/frontend release pointers (Nginx + systemd topology).
 *
 *   node scripts/systemd-release-switch.mjs deploy --sha <40> --api-src <dir> --frontend-src <dir> [--root <prefix>] [--dry-run]
 *   node scripts/systemd-release-switch.mjs replace-frontend --sha <40> --frontend-src <dir> [--root <prefix>] [--dry-run]
 *   node scripts/systemd-release-switch.mjs rollback [--root <prefix>] [--dry-run]
 *
 * --root remaps absolute production paths under a test prefix (isolated dry-run).
 * Never prints env file contents or secret values.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PATHS,
  PRODUCTION_TOPOLOGY,
  apiReleaseDir,
  assertFullGitSha,
  buildDeployState,
  frontendReleaseDir,
  rewriteApiSafeStartExec,
  sha256Hex,
  unitReleaseDropInContents,
} from "./lib/systemd-release.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    action: "",
    sha: "",
    apiSrc: "",
    frontendSrc: "",
    root: "",
    dryRun: false,
    skipHealth: false,
    skipRestart: false,
    frontendLabel: "",
  };
  const rest = [...argv];
  args.action = rest.shift() || "";
  while (rest.length) {
    const token = rest.shift();
    if (token === "--sha") args.sha = rest.shift() || "";
    else if (token === "--api-src") args.apiSrc = rest.shift() || "";
    else if (token === "--frontend-src") args.frontendSrc = rest.shift() || "";
    else if (token === "--root") args.root = rest.shift() || "";
    else if (token === "--frontend-label") args.frontendLabel = rest.shift() || "";
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--skip-health") args.skipHealth = true;
    else if (token === "--skip-restart") args.skipRestart = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function mapPath(rootPrefix, absolutePath) {
  if (!rootPrefix) return absolutePath;
  // Keep POSIX-style paths under the prefix so Linux production scripts and
  // Windows isolated tests share the same logical layout.
  const rel = String(absolutePath).replace(/^\/+/, "");
  return `${String(rootPrefix).replace(/[\\/]+$/, "")}/${rel}`.replace(/\\/g, "/");
}

function pathsFor(rootPrefix) {
  const mapped = {};
  for (const [key, value] of Object.entries(DEFAULT_PATHS)) {
    mapped[key] = typeof value === "string" && value.startsWith("/") ? mapPath(rootPrefix, value) : value;
  }
  return mapped;
}

function log(message) {
  console.log(`[systemd-release] ${message}`);
}

function readLinkOrNull(path) {
  try {
    if (!existsSync(path)) return null;
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return readlinkSync(path);
    return path;
  } catch {
    return null;
  }
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function atomicSymlink(linkPath, targetPath) {
  ensureDir(dirname(linkPath));
  if (!existsSync(targetPath)) {
    throw new Error(`Missing symlink target: ${targetPath}`);
  }
  const tmp = `${linkPath}.new-${process.pid}`;
  try {
    rmSync(tmp, { force: true });
  } catch {
    /* ignore */
  }
  // Windows isolated tests: directory junctions do not require elevated symlink privilege.
  const type = process.platform === "win32" ? "junction" : undefined;
  if (type) symlinkSync(targetPath, tmp, type);
  else symlinkSync(targetPath, tmp);
  try {
    // Prefer atomic replace when the platform allows renaming over an existing link.
    renameSync(tmp, linkPath);
  } catch {
    rmSync(linkPath, { force: true });
    renameSync(tmp, linkPath);
  }
}

function run(command, args, { dryRun, allowFail = false } = {}) {
  if (dryRun) {
    log(`dry-run: ${command} ${args.join(" ")}`);
    return { status: 0, stdout: "", stderr: "" };
  }
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0 && !allowFail) {
    const err = (result.stderr || result.stdout || "").trim().slice(0, 500);
    throw new Error(`${command} failed (${result.status}): ${err}`);
  }
  return result;
}

function requireApiArtifact(apiSrc) {
  const main = join(apiSrc, "artifacts/api-server/dist/main.mjs");
  const start = join(apiSrc, "deploy/vps/start-api.mjs");
  if (!existsSync(main)) throw new Error("API artifact missing artifacts/api-server/dist/main.mjs");
  if (!existsSync(start)) throw new Error("API artifact missing deploy/vps/start-api.mjs");
  return { main, start };
}

function requireFrontendArtifact(frontendSrc) {
  const index = join(frontendSrc, "index.html");
  const version = join(frontendSrc, "version.json");
  if (!existsSync(index)) throw new Error("Frontend artifact missing index.html");
  if (!existsSync(version)) throw new Error("Frontend artifact missing version.json");
}

function readFrontendArtifactSha(frontendSrc) {
  requireFrontendArtifact(frontendSrc);
  const raw = JSON.parse(readFileSync(join(frontendSrc, "version.json"), "utf8"));
  return assertFullGitSha(raw?.sha);
}

function assertFrontendArtifactMatchesSha(frontendSrc, sha) {
  const artifactSha = readFrontendArtifactSha(frontendSrc);
  const expected = assertFullGitSha(sha);
  if (artifactSha !== expected) {
    throw new Error(
      `Frontend artifact version.json sha ${artifactSha} does not match expected ${expected}`,
    );
  }
  const html = readFileSync(join(frontendSrc, "index.html"), "utf8");
  if (!html.includes(`content="${expected}"`)) {
    throw new Error("Frontend index.html valueor-build meta does not match expected sha");
  }
  return artifactSha;
}

const FRONTEND_MARKER_NEEDLES = [
  "assignedAiEmployeeId",
  "missingConfigKeys",
  "MSL_META_CONFIG_MISSING",
];

function assertFrontendArtifactHasRolloutMarkers(frontendSrc) {
  const assetsDir = join(frontendSrc, "assets");
  if (!existsSync(assetsDir)) {
    throw new Error("Frontend artifact missing assets/ directory");
  }
  const files = readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => join(assetsDir, name));
  const blob = files
    .slice(0, 600)
    .map((path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
  for (const needle of FRONTEND_MARKER_NEEDLES) {
    if (!blob.includes(needle)) {
      throw new Error(`Frontend artifact missing required marker: ${needle}`);
    }
  }
}

function writeReleaseMetadata(releaseDir, sha, kind, extra = {}) {
  writeFileSync(join(releaseDir, "RELEASE_SHA"), `${sha}\n`, { mode: 0o640 });
  const manifest = [
    `topology=${PRODUCTION_TOPOLOGY}`,
    `kind=${kind}`,
    `sha=${sha}`,
    `created_utc=${new Date().toISOString()}`,
    ...Object.entries(extra).map(([k, v]) => `${k}=${v}`),
    "",
  ].join("\n");
  writeFileSync(join(releaseDir, "RELEASE_MANIFEST.txt"), manifest, { mode: 0o640 });
}

function backupFile(backupDir, srcPath, name) {
  if (!existsSync(srcPath)) return null;
  ensureDir(backupDir);
  const dest = join(backupDir, name);
  copyFileSync(srcPath, dest);
  return dest;
}

function installApiRelease(paths, sha, apiSrc) {
  const dest = apiReleaseDir(paths, sha);
  if (existsSync(dest)) {
    throw new Error(`API release already exists: ${dest}`);
  }
  ensureDir(dest);
  // Minimal runtime tree required by start-api.mjs + bundled main.mjs
  for (const rel of [
    "artifacts/api-server/dist",
    "deploy/vps",
    "scripts/lib",
  ]) {
    ensureDir(join(dest, rel));
  }
  cpSync(join(apiSrc, "artifacts/api-server/dist"), join(dest, "artifacts/api-server/dist"), {
    recursive: true,
  });
  cpSync(join(apiSrc, "deploy/vps/start-api.mjs"), join(dest, "deploy/vps/start-api.mjs"));
  // start-api imports scripts/lib/vps-runtime.mjs (+ deps). Copy the lib folder from the artifact tree or repo.
  const libSrc = existsSync(join(apiSrc, "scripts/lib"))
    ? join(apiSrc, "scripts/lib")
    : join(repoRoot, "scripts/lib");
  cpSync(libSrc, join(dest, "scripts/lib"), { recursive: true });
  if (existsSync(join(apiSrc, "package.json"))) {
    copyFileSync(join(apiSrc, "package.json"), join(dest, "package.json"));
  } else if (existsSync(join(repoRoot, "package.json"))) {
    copyFileSync(join(repoRoot, "package.json"), join(dest, "package.json"));
  }
  writeReleaseMetadata(dest, sha, "api", {
    main_sha256: sha256Hex(readFileSync(join(dest, "artifacts/api-server/dist/main.mjs"))),
  });
  return dest;
}

function installFrontendRelease(paths, sha, frontendSrc, label) {
  const dest = frontendReleaseDir(paths, sha, label);
  if (existsSync(dest)) {
    throw new Error(`Frontend release already exists: ${dest}`);
  }
  ensureDir(dest);
  cpSync(frontendSrc, dest, { recursive: true });
  writeReleaseMetadata(dest, sha, "frontend");
  return dest;
}

function ensureSafeStart(paths, apiReleasePath, { dryRun }) {
  const safeStartPath = paths.apiSafeStart;
  ensureDir(dirname(safeStartPath));
  let current = "";
  if (existsSync(safeStartPath)) {
    current = readFileSync(safeStartPath, "utf8");
  } else {
    current = [
      "#!/bin/bash",
      "set -eu",
      "export VALUEOR_ENV=production",
      "export NODE_ENV=production",
      "export PORT=3001",
      "export NODE_PATH=/opt/valueor-runtime/node_modules",
      "exec /usr/bin/node /opt/valueor-releases/placeholder/deploy/vps/start-api.mjs",
      "",
    ].join("\n");
  }
  // Always point exec at the current symlink path so flips do not require rewriting exports.
  const next = rewriteApiSafeStartExec(current, paths.apiCurrentLink);
  if (dryRun) {
    log(`dry-run: would update ${safeStartPath} exec -> ${paths.apiCurrentLink}/deploy/vps/start-api.mjs`);
    return;
  }
  writeFileSync(safeStartPath, next, { mode: 0o755 });
  // Keep NODE_PATH line if present; do not invent env values.
  void apiReleasePath;
}

function ensureUnitDropIn(paths, { dryRun }) {
  const contents = unitReleaseDropInContents();
  if (dryRun) {
    log(`dry-run: would write ${paths.unitDropInFile}`);
    return;
  }
  ensureDir(paths.unitDropInDir);
  writeFileSync(paths.unitDropInFile, contents, { mode: 0o644 });
}

function writeState(paths, state, { dryRun }) {
  if (dryRun) {
    log(`dry-run: would write deploy state for sha ${state.sha}`);
    return;
  }
  ensureDir(dirname(paths.deployStateFile));
  writeFileSync(paths.deployStateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o640 });
}

function readState(paths) {
  if (!existsSync(paths.deployStateFile)) {
    throw new Error(`Missing deploy state at ${paths.deployStateFile}`);
  }
  return JSON.parse(readFileSync(paths.deployStateFile, "utf8"));
}

function restartApi(paths, { dryRun, skipRestart }) {
  if (skipRestart) {
    log("skip-restart: not touching systemd");
    return;
  }
  run("systemctl", ["daemon-reload"], { dryRun });
  run("systemctl", ["restart", paths.unitName], { dryRun });
  run("systemctl", ["is-active", paths.unitName], { dryRun });
}

function healthCheck(paths, { dryRun, skipHealth }) {
  if (skipHealth) {
    log("skip-health: not probing endpoints");
    return;
  }
  const port = paths.apiPort;
  const checks = [
    ["local-healthz", ["-fsS", "--max-time", "5", `http://127.0.0.1:${port}/api/healthz`]],
    ["local-readyz", ["-fsS", "--max-time", "5", `http://127.0.0.1:${port}/api/readyz`]],
    [
      "nginx-api",
      [
        "-fsSk",
        "--max-time",
        "5",
        "--resolve",
        "api.valueor.org:443:127.0.0.1",
        "https://api.valueor.org/api/healthz",
      ],
    ],
    [
      "nginx-webhook",
      [
        "-fsSk",
        "--max-time",
        "5",
        "--resolve",
        "webhook.valueor.org:443:127.0.0.1",
        "https://webhook.valueor.org/api/healthz",
      ],
    ],
  ];
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      for (const [name, args] of checks) {
        const result = run("curl", args, { dryRun });
        if (!dryRun && result.status !== 0) throw new Error(name);
      }
      log(`health checks passed (attempt ${attempt})`);
      return;
    } catch (error) {
      if (attempt === 30) throw error;
      if (!dryRun) spawnSync("sleep", ["2"]);
    }
  }
}

function deploy(args) {
  const sha = assertFullGitSha(args.sha);
  const paths = pathsFor(args.root);
  requireApiArtifact(args.apiSrc);
  requireFrontendArtifact(args.frontendSrc);

  const previousApi = readLinkOrNull(paths.apiCurrentLink);
  const previousFe = readLinkOrNull(paths.frontendCurrentLink);
  const previousFePrev = readLinkOrNull(paths.frontendPreviousLink);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(paths.backupRoot, stamp);
  if (!args.dryRun) ensureDir(backupDir);
  backupFile(backupDir, paths.apiSafeStart, "api-safe-start.sh");
  backupFile(backupDir, paths.deployStateFile, "deploy-state.json");
  backupFile(backupDir, paths.unitDropInFile, "50-release.conf");
  log(`backup_dir=${args.dryRun ? "(dry-run)" : backupDir}`);
  log(`previous_api=${previousApi || "(none)"}`);
  log(`previous_frontend=${previousFe || "(none)"}`);

  const apiRelease = args.dryRun
    ? apiReleaseDir(paths, sha)
    : installApiRelease(paths, sha, resolve(args.apiSrc));
  const feRelease = args.dryRun
    ? frontendReleaseDir(paths, sha, args.frontendLabel)
    : installFrontendRelease(paths, sha, resolve(args.frontendSrc), args.frontendLabel);

  if (args.dryRun) {
    log(`dry-run: api release would be ${apiRelease}`);
    log(`dry-run: frontend release would be ${feRelease}`);
  }

  ensureUnitDropIn(paths, args);
  ensureSafeStart(paths, apiRelease, args);

  if (!args.dryRun) {
    atomicSymlink(paths.apiCurrentLink, apiRelease);
    if (previousFe) {
      atomicSymlink(paths.frontendPreviousLink, previousFe);
    }
    atomicSymlink(paths.frontendCurrentLink, feRelease);
  } else {
    log(`dry-run: would flip ${paths.apiCurrentLink} -> ${apiRelease}`);
    log(`dry-run: would flip ${paths.frontendCurrentLink} -> ${feRelease}`);
  }

  const state = buildDeployState({
    sha,
    apiRelease,
    frontendRelease: feRelease,
    previousApiRelease: previousApi,
    previousFrontendRelease: previousFe,
    previousFrontendPrevious: previousFePrev,
  });
  writeState(paths, state, args);

  try {
    restartApi(paths, args);
    healthCheck(paths, args);
  } catch (error) {
    log(`deploy health/restart failed: ${error.message}`);
    log("attempting automatic rollback to previous release pointers");
    rollback({ ...args, forceState: state, automatic: true });
    throw new Error(`Deploy failed and rollback was attempted: ${error.message}`);
  }

  log(`deploy complete sha=${sha}`);
  log(`api_release=${apiRelease}`);
  log(`frontend_release=${feRelease}`);
}

/**
 * Frontend-only corrective install.
 * Quarantines a corrupt same-SHA frontend release directory if present, installs
 * the verified artifact, flips /var/www/valueor, and never touches API/systemd.
 */
function replaceFrontend(args) {
  const sha = assertFullGitSha(args.sha);
  const frontendSrc = resolve(args.frontendSrc);
  assertFrontendArtifactMatchesSha(frontendSrc, sha);
  assertFrontendArtifactHasRolloutMarkers(frontendSrc);

  const paths = pathsFor(args.root);
  const dest = frontendReleaseDir(paths, sha, args.frontendLabel);
  const previousFe = readLinkOrNull(paths.frontendCurrentLink);
  const previousFePrev = readLinkOrNull(paths.frontendPreviousLink);

  log(`replace-frontend sha=${sha}`);
  log(`frontend_src=${frontendSrc}`);
  log(`dest=${dest}`);
  log(`previous_frontend=${previousFe || "(none)"}`);

  if (existsSync(dest)) {
    const quarantine = `${dest}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    if (args.dryRun) {
      log(`dry-run: would quarantine ${dest} -> ${quarantine}`);
    } else {
      renameSync(dest, quarantine);
      log(`quarantined ${dest} -> ${quarantine}`);
    }
  }

  const feRelease = args.dryRun
    ? dest
    : installFrontendRelease(paths, sha, frontendSrc, args.frontendLabel);

  // Preserve rollback chain: keep prior good release as .previous when possible.
  // Normalize paths so Windows junctions / slash differences do not treat the
  // quarantined same-SHA dest as a valid previous pointer.
  const samePath = (a, b) => {
    if (!a || !b) return false;
    return resolve(a).replace(/\\/g, "/").toLowerCase() === resolve(b).replace(/\\/g, "/").toLowerCase();
  };
  let nextPrevious = null;
  if (previousFe && !samePath(previousFe, dest) && !samePath(previousFe, feRelease)) {
    nextPrevious = previousFe;
  } else if (previousFePrev && !samePath(previousFePrev, dest) && !samePath(previousFePrev, feRelease)) {
    nextPrevious = previousFePrev;
  }

  if (!args.dryRun) {
    if (nextPrevious && existsSync(nextPrevious)) {
      atomicSymlink(paths.frontendPreviousLink, nextPrevious);
    }
    atomicSymlink(paths.frontendCurrentLink, feRelease);
  } else {
    log(`dry-run: would flip ${paths.frontendCurrentLink} -> ${feRelease}`);
    if (nextPrevious) {
      log(`dry-run: would set ${paths.frontendPreviousLink} -> ${nextPrevious}`);
    }
  }

  // Update deploy-state frontend pointers only; keep API pointers untouched.
  let state = null;
  try {
    state = readState(paths);
  } catch {
    state = null;
  }
  const nextState = buildDeployState({
    sha: state?.sha && /^[0-9a-f]{40}$/i.test(state.sha) ? state.sha : sha,
    apiRelease: state?.apiRelease || readLinkOrNull(paths.apiCurrentLink),
    frontendRelease: feRelease,
    previousApiRelease: state?.previousApiRelease || null,
    previousFrontendRelease: nextPrevious || state?.previousFrontendRelease || null,
    previousFrontendPrevious: state?.previousFrontendPrevious || null,
  });
  writeState(paths, nextState, args);

  log(`replace-frontend complete sha=${sha}`);
  log(`frontend_release=${feRelease}`);
  log(`frontend_previous=${nextPrevious || "(unchanged)"}`);
  log("api_untouched=yes restart_skipped=yes");
}

function rollback(args) {
  const paths = pathsFor(args.root);
  const state = args.forceState || readState(paths);
  if (state.topology && state.topology !== PRODUCTION_TOPOLOGY) {
    throw new Error(`Refusing rollback for topology ${state.topology}`);
  }
  const prevApi = state.previousApiRelease;
  const prevFe = state.previousFrontendRelease;
  if (!prevApi) throw new Error("No previous API release recorded in deploy state.");
  if (!prevFe) throw new Error("No previous frontend release recorded in deploy state.");
  if (!args.dryRun) {
    if (!existsSync(prevApi)) throw new Error(`Previous API release missing: ${prevApi}`);
    if (!existsSync(prevFe)) throw new Error(`Previous frontend release missing: ${prevFe}`);
  }

  ensureUnitDropIn(paths, args);
  ensureSafeStart(paths, prevApi, args);

  if (!args.dryRun) {
    atomicSymlink(paths.apiCurrentLink, prevApi);
    atomicSymlink(paths.frontendCurrentLink, prevFe);
    if (state.previousFrontendPrevious && existsSync(state.previousFrontendPrevious)) {
      atomicSymlink(paths.frontendPreviousLink, state.previousFrontendPrevious);
    }
  } else {
    log(`dry-run: would restore api -> ${prevApi}`);
    log(`dry-run: would restore frontend -> ${prevFe}`);
  }

  const restored = buildDeployState({
    sha: state.sha,
    apiRelease: prevApi,
    frontendRelease: prevFe,
    previousApiRelease: state.apiRelease || null,
    previousFrontendRelease: state.frontendRelease || null,
    previousFrontendPrevious: state.previousFrontendRelease || null,
  });
  // Keep sha as the rolled-back release identity when available from directory metadata.
  if (!args.dryRun && existsSync(join(prevApi, "RELEASE_SHA"))) {
    restored.sha = assertFullGitSha(readFileSync(join(prevApi, "RELEASE_SHA"), "utf8").trim());
  }
  writeState(paths, restored, args);
  restartApi(paths, args);
  if (!args.automatic) {
    healthCheck(paths, args);
  } else {
    // Best-effort health after automatic rollback; do not recurse.
    try {
      healthCheck(paths, { ...args, skipHealth: args.skipHealth });
    } catch (error) {
      log(`automatic rollback health still failing: ${error.message}`);
    }
  }
  log("rollback complete");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!["deploy", "replace-frontend", "rollback"].includes(args.action)) {
    console.error("Usage: systemd-release-switch.mjs deploy|replace-frontend|rollback [options]");
    process.exit(2);
  }
  if (args.action === "deploy") {
    if (!args.sha || !args.apiSrc || !args.frontendSrc) {
      console.error("deploy requires --sha, --api-src, and --frontend-src");
      process.exit(2);
    }
    deploy(args);
    return;
  }
  if (args.action === "replace-frontend") {
    if (!args.sha || !args.frontendSrc) {
      console.error("replace-frontend requires --sha and --frontend-src");
      process.exit(2);
    }
    replaceFrontend(args);
    return;
  }
  rollback(args);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`[systemd-release] ERROR: ${error.message}`);
    process.exit(1);
  }
}

export {
  deploy,
  rollback,
  parseArgs,
  pathsFor,
  installApiRelease,
  installFrontendRelease,
  mapPath,
  mkdtempSync,
  tmpdir,
};
