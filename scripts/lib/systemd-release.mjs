/**
 * Contabo production release helpers (Nginx + systemd + release directories).
 * Pure logic only — no secret values, no network, no systemd calls.
 */
import { createHash } from "node:crypto";

export const PRODUCTION_TOPOLOGY = "nginx-systemd";
export const COMPOSE_TOPOLOGY = "compose";

export const DEFAULT_PATHS = Object.freeze({
  appDir: "/opt/valueor",
  envFile: "/opt/valueor/.env",
  apiReleasesDir: "/opt/valueor-releases",
  frontendReleasesDir: "/opt/valueor-frontend-releases",
  apiCurrentLink: "/opt/valueor-current",
  frontendCurrentLink: "/var/www/valueor",
  frontendPreviousLink: "/var/www/valueor.previous",
  apiSafeStart: "/etc/valueor/api-safe-start.sh",
  unitDropInDir: "/etc/systemd/system/valueor-api.service.d",
  unitDropInFile: "/etc/systemd/system/valueor-api.service.d/50-release.conf",
  deployStateFile: "/var/lib/valueor/deploy-state.json",
  backupRoot: "/var/backups/valueor/deploys",
  runtimeNodeModules: "/opt/valueor-runtime/node_modules",
  unitName: "valueor-api.service",
  apiPort: 3001,
});

const FULL_SHA_RE = /^[0-9a-f]{40}$/;

export function assertFullGitSha(sha) {
  const value = String(sha ?? "").trim().toLowerCase();
  if (!FULL_SHA_RE.test(value)) {
    throw new Error("Refusing a ref that is not a full 40-char git SHA.");
  }
  return value;
}

export function shortReleaseId(sha) {
  return assertFullGitSha(sha).slice(0, 16);
}

export function apiReleaseDir(paths, sha) {
  return `${paths.apiReleasesDir}/${shortReleaseId(sha)}`;
}

export function frontendReleaseDir(paths, sha, label = "") {
  const base = assertFullGitSha(sha).slice(0, 16);
  const suffix = String(label || "").trim();
  return suffix
    ? `${paths.frontendReleasesDir}/${base}-${suffix}`
    : `${paths.frontendReleasesDir}/${base}`;
}

/**
 * Rewrite only the final `exec … start-api.mjs` line.
 * Preserves every export / env assignment in the live safe-start script.
 */
export function rewriteApiSafeStartExec(scriptText, releaseRoot) {
  const root = String(releaseRoot ?? "").replace(/[\\/]+$/, "").replace(/\\/g, "/");
  if (!root.startsWith("/") && !/^[A-Za-z]:\//.test(root)) {
    throw new Error("API release root must be an absolute path.");
  }
  const execLine = `exec /usr/bin/node ${root}/deploy/vps/start-api.mjs`;
  const lines = String(scriptText).split(/\r?\n/);
  let replaced = 0;
  const next = lines.map((line) => {
    if (/^\s*exec\s+\/usr\/bin\/node\s+\S+\/deploy\/vps\/start-api\.mjs\s*$/.test(line)) {
      replaced += 1;
      return execLine;
    }
    return line;
  });
  if (replaced !== 1) {
    throw new Error(`Expected exactly one start-api.mjs exec line in api-safe-start.sh (found ${replaced}).`);
  }
  return next.join("\n");
}

export function unitReleaseDropInContents() {
  return [
    "# Managed by ValueOR systemd-release deploy. Do not replace the custom unit file.",
    "# Overrides WorkingDirectory so /opt/valueor-current can flip between releases.",
    "[Service]",
    "WorkingDirectory=/opt/valueor-current",
    "",
  ].join("\n");
}

export function buildDeployState({
  sha,
  apiRelease,
  frontendRelease,
  previousApiRelease = null,
  previousFrontendRelease = null,
  previousFrontendPrevious = null,
  deployedAt = new Date().toISOString(),
}) {
  return {
    topology: PRODUCTION_TOPOLOGY,
    sha: assertFullGitSha(sha),
    deployedAt,
    apiRelease,
    frontendRelease,
    previousApiRelease,
    previousFrontendRelease,
    previousFrontendPrevious,
  };
}

export function planSymlinkSwitch({
  apiCurrent,
  frontendCurrent,
  frontendPrevious,
  nextApiRelease,
  nextFrontendRelease,
}) {
  return {
    apiCurrent: { link: apiCurrent, target: nextApiRelease },
    frontendPrevious: {
      link: frontendPrevious,
      target: frontendCurrent ? resolveExistingTarget(frontendCurrent) : null,
    },
    frontendCurrent: { link: frontendCurrent, target: nextFrontendRelease },
  };
}

function resolveExistingTarget(linkPath) {
  return { fromLink: linkPath };
}

export function sha256Hex(bufferOrString) {
  return createHash("sha256").update(bufferOrString).digest("hex");
}

function stripShellComments(scriptText) {
  return String(scriptText)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#");
    })
    .join("\n");
}

export function productionScriptProblems(scriptText, { role }) {
  const text = stripShellComments(scriptText);
  const problems = [];
  if (/\bdocker\b/i.test(text) || /\bcompose\.yml\b/.test(text)) {
    problems.push(`${role} must not invoke Docker or Compose.`);
  }
  if (/\bcaddy\b/i.test(text) && role !== "docs") {
    problems.push(`${role} must not invoke Caddy.`);
  }
  if (role === "prod-deploy-wrapper" || role === "prod-rollback-wrapper") {
    if (!text.includes("systemd-release-deploy.sh") && role === "prod-deploy-wrapper") {
      problems.push("valueor-prod-deploy.sh must call systemd-release-deploy.sh.");
    }
    if (!text.includes("systemd-release-rollback.sh") && role === "prod-rollback-wrapper") {
      problems.push("valueor-prod-rollback.sh must call systemd-release-rollback.sh.");
    }
    if (/\bremote-deploy\.sh\b/.test(text) || /\bremote-rollback\.sh\b/.test(text)) {
      problems.push(`${role} must not call Compose remote-deploy/rollback scripts.`);
    }
  }
  return problems;
}

export function workflowProductionPathProblems(workflowText) {
  const text = String(workflowText);
  const problems = [];
  if (!text.includes("valueor-production")) {
    problems.push("vps-deploy.yml must run deploy on the valueor-production self-hosted runner.");
  }
  if (!text.includes("ubuntu-latest")) {
    problems.push("vps-deploy.yml must keep gate/build on GitHub-hosted ubuntu-latest.");
  }
  if (text.includes("remote-deploy.sh") || text.includes("remote-rollback.sh")) {
    problems.push("vps-deploy.yml must not call Compose remote-deploy/rollback scripts.");
  }
  if (!text.includes("valueor-prod-deploy") || !text.includes("valueor-prod-rollback")) {
    problems.push("vps-deploy.yml must invoke the restricted valueor-prod-deploy/rollback wrappers.");
  }
  if (!/github\.ref\s*==\s*'refs\/heads\/main'/.test(text)) {
    problems.push("vps-deploy.yml must restrict actions to main.");
  }
  return problems;
}

const PRODUCTION_PUBLISH_MARKERS = [
  /\bVPS_SSH_KEY\b/,
  /\bVPS_HOST\b/,
  /\bVPS_USER\b/,
  /\bVPS_KNOWN_HOSTS\b/,
  /\bscp\b/,
  /\bpublish-www\b/,
  /\bpublish_www\b/,
  /\bvalueor-prod-deploy\b/,
  /\bvalueor-prod-rollback\b/,
  /\bremote-deploy\.sh\b/,
  /\bremote-rollback\.sh\b/,
  /\bsystemd-release-deploy\.sh\b/,
  /\bpublish-frontend-release\.sh\b/,
];

const APPROVED_PRODUCTION_WORKFLOW = "vps-deploy.yml";
const APPROVED_FRONTEND_REPLACE_WORKFLOW = "contabo-fe-replace.yml";

/**
 * Constraints for the approved frontend-only corrective workflow.
 * It may invoke valueor-prod-deploy with a .replace-frontend-only marker,
 * but must never SSH/SCP publish or call rollback.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function frontendReplaceWorkflowProblems(text) {
  const problems = [];
  const body = String(text ?? "");
  if (!body.includes("valueor-production")) {
    problems.push(`${APPROVED_FRONTEND_REPLACE_WORKFLOW} must run on the valueor-production self-hosted runner.`);
  }
  if (!/\.replace-frontend-only\b/.test(body)) {
    problems.push(`${APPROVED_FRONTEND_REPLACE_WORKFLOW} must stage .replace-frontend-only for FE-only installs.`);
  }
  if (!/confirm\s*==\s*'replace-frontend'/.test(body)) {
    problems.push(`${APPROVED_FRONTEND_REPLACE_WORKFLOW} must require confirm == 'replace-frontend'.`);
  }
  const deployHits = [...body.matchAll(/\/usr\/local\/sbin\/valueor-prod-deploy\b/g)];
  if (deployHits.length !== 1) {
    problems.push(
      `${APPROVED_FRONTEND_REPLACE_WORKFLOW} must contain exactly one /usr/local/sbin/valueor-prod-deploy invocation (found ${deployHits.length}).`,
    );
  }
  if (/\bvalueor-prod-rollback\b/.test(body)) {
    problems.push(`${APPROVED_FRONTEND_REPLACE_WORKFLOW} must not invoke valueor-prod-rollback.`);
  }
  for (const marker of PRODUCTION_PUBLISH_MARKERS) {
    if (marker.source === "\\bvalueor-prod-deploy\\b") continue;
    if (marker.test(body)) {
      problems.push(
        `${APPROVED_FRONTEND_REPLACE_WORKFLOW} must not contain production publish marker ${marker}.`,
      );
    }
  }
  return problems;
}

/**
 * Audit every GitHub Actions workflow so Contabo publishing cannot bypass
 * the single approved self-hosted production entry point.
 *
 * @param {Array<{ name: string, text: string }>} workflows
 * @returns {string[]}
 */
export function githubWorkflowProductionEntryProblems(workflows) {
  const problems = [];
  const list = Array.isArray(workflows) ? workflows : [];
  const byName = new Map(list.map((item) => [String(item.name), String(item.text ?? "")]));

  if (!byName.has(APPROVED_PRODUCTION_WORKFLOW)) {
    problems.push(`Missing required production workflow ${APPROVED_PRODUCTION_WORKFLOW}.`);
    return problems;
  }

  problems.push(...workflowProductionPathProblems(byName.get(APPROVED_PRODUCTION_WORKFLOW)));

  const deployHits = [...byName.get(APPROVED_PRODUCTION_WORKFLOW).matchAll(/\bvalueor-prod-deploy\b/g)];
  const rollbackHits = [...byName.get(APPROVED_PRODUCTION_WORKFLOW).matchAll(/\bvalueor-prod-rollback\b/g)];
  if (deployHits.length !== 1) {
    problems.push(`${APPROVED_PRODUCTION_WORKFLOW} must contain exactly one valueor-prod-deploy invocation (found ${deployHits.length}).`);
  }
  if (rollbackHits.length !== 1) {
    problems.push(`${APPROVED_PRODUCTION_WORKFLOW} must contain exactly one valueor-prod-rollback invocation (found ${rollbackHits.length}).`);
  }
  if (/\bVPS_SSH_KEY\b/.test(byName.get(APPROVED_PRODUCTION_WORKFLOW)) || /\bscp\b/.test(byName.get(APPROVED_PRODUCTION_WORKFLOW))) {
    problems.push(`${APPROVED_PRODUCTION_WORKFLOW} must not publish over SSH/SCP from GitHub-hosted runners.`);
  }

  if (byName.has(APPROVED_FRONTEND_REPLACE_WORKFLOW)) {
    problems.push(...frontendReplaceWorkflowProblems(byName.get(APPROVED_FRONTEND_REPLACE_WORKFLOW)));
  }

  for (const [name, text] of byName) {
    if (name === APPROVED_PRODUCTION_WORKFLOW) continue;
    if (name === APPROVED_FRONTEND_REPLACE_WORKFLOW) continue;
    for (const marker of PRODUCTION_PUBLISH_MARKERS) {
      if (marker.test(text)) {
        problems.push(`${name} must not contain production publish marker ${marker}. Use ${APPROVED_PRODUCTION_WORKFLOW} only.`);
      }
    }
    if (/environment:\s*production/.test(text) && (/\bssh\b/i.test(text) || /\bscp\b/i.test(text))) {
      problems.push(`${name} must not use the production environment for SSH publishing.`);
    }
  }

  const frontend = byName.get("frontend-production-artifact.yml");
  if (frontend) {
    if (/publish-www|publish_www|VPS_SSH_KEY|\bscp\b/.test(frontend)) {
      problems.push("frontend-production-artifact.yml must remain build-only (no publish-www / SSH publish).");
    }
  }

  const deployText = byName.get(APPROVED_PRODUCTION_WORKFLOW) ?? "";
  if (!/VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED:\s*"true"/.test(deployText)) {
    problems.push(
      `${APPROVED_PRODUCTION_WORKFLOW} must bake VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED: \"true\" into the frontend build.`,
    );
  }
  if (!/VITE_WHATSAPP_COEXISTENCE_ENABLED:\s*"false"/.test(deployText)) {
    problems.push(
      `${APPROVED_PRODUCTION_WORKFLOW} must bake VITE_WHATSAPP_COEXISTENCE_ENABLED: \"false\" until Coexistence is approved.`,
    );
  }

  return [...new Set(problems)];
}

export function healthcheckCommands({ apiPort = 3001 } = {}) {
  return {
    localHealthz: `curl -fsS --max-time 5 http://127.0.0.1:${apiPort}/api/healthz`,
    localReadyz: `curl -fsS --max-time 5 http://127.0.0.1:${apiPort}/api/readyz`,
    apiViaNginx:
      "curl -fsSk --max-time 5 --resolve api.valueor.org:443:127.0.0.1 https://api.valueor.org/api/healthz",
    webhookViaNginx:
      "curl -fsSk --max-time 5 --resolve webhook.valueor.org:443:127.0.0.1 https://webhook.valueor.org/api/healthz",
    wwwViaNginx:
      "curl -fsSk --max-time 5 --resolve www.valueor.org:443:127.0.0.1 -o /dev/null -w '%{http_code}' https://www.valueor.org/",
  };
}

/**
 * Atomic symlink replace: link -> target (directory must exist).
 * Returns shell commands (no execution).
 */
export function symlinkReplaceCommands(linkPath, targetPath) {
  const link = String(linkPath);
  const target = String(targetPath);
  const tmp = `${link}.new.$$`;
  return [
    `test -d "${target}"`,
    `ln -sfn "${target}" "${tmp}"`,
    `mv -Tf "${tmp}" "${link}"`,
  ];
}
