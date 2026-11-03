import { execFileSync } from "node:child_process";
import console from "node:console";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const project = "veni-reserve";
const label = `com.supabase.cli.project=${project}`;
const marker = join(root, ".tmp/m13-ci-started");
const configPath = join(root, "supabase/config.toml");
class SafeError extends Error {}

// Only fixed phase names enter from the command line. Never print subprocess errors:
// stdout, stderr, args and exception messages can contain local credentials.
/** @param {string} file @param {string[]} args @param {number} [timeout] @param {string} [input] */
export function capture(file, args, timeout = 30_000, input) {
  try {
    return execFileSync(file, args, {
      cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      timeout, maxBuffer: 8 * 1024 * 1024, input,
    }).trim();
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? error.status : null;
    throw new SafeError(`Child failed (exit ${typeof status === "number" ? status : "unavailable/timeout"}); output withheld.`);
  }
}

/** @param {boolean} condition @param {string} message */
function requireSafe(condition, message) {
  if (!condition) throw new SafeError(message);
}

/** @param {NodeJS.ProcessEnv} env */
export function guardEnvironment(env) {
  requireSafe(env.SUPABASE_EXPERIMENTAL_STACK === "0", "Docker runtime flag must be exactly 0.");
  for (const key of ["SUPABASE_CLI_BINARY_OVERRIDE", "SUPABASE_EXPERIMENTAL", "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD", "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "PGHOST", "PGSERVICE", "PGPASSWORD",
    "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "NODE_OPTIONS"]) {
    requireSafe(!env[key], `Forbidden environment override: ${key}.`);
  }
  // Fail closed on other externally selected Supabase runtimes/binaries as well.
  for (const key of Object.keys(env)) {
    if (/^SUPABASE_.*(?:EXPERIMENTAL|NATIVE|RUNTIME|BINARY|STACK)/.test(key) && key !== "SUPABASE_EXPERIMENTAL_STACK")
      requireSafe(!env[key], "Unexpected Supabase runtime override.");
  }
}

function canonicalGuard() {
  guardEnvironment(process.env);
  const config = readFileSync(configPath, "utf8");
  const committed = capture("git", ["show", "HEAD:supabase/config.toml"]);
  requireSafe(config.replaceAll("\r\n", "\n").trim() === committed.replaceAll("\r\n", "\n").trim(), "Canonical config differs from HEAD.");
  requireSafe(/^project_id = "veni-reserve"$/m.test(config), "Canonical project ID mismatch.");
  requireSafe(/^enable_anonymous_sign_ins = false$/m.test(config), "Canonical anonymous sign-in must be disabled.");
  for (const path of ["supabase/.temp/project-ref", ".env", "supabase/.env"])
    requireSafe(!existsSync(join(root, path)), "Hosted link or unreviewed environment file present.");
}

function dockerGuard() {
  const context = capture("docker", ["context", "show"]);
  const endpoint = capture("docker", ["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]);
  const localLinux = process.platform === "linux" && context === "default" && endpoint === "unix:///var/run/docker.sock";
  const localWindows = process.platform === "win32" && context === "desktop-linux" && endpoint === "npipe:////./pipe/dockerDesktopLinuxEngine";
  requireSafe(localLinux || localWindows, "Unexpected Docker context/endpoint.");
  requireSafe(process.arch === "x64", "Expected x64 host.");
  if (process.env.GITHUB_ACTIONS === "true")
    requireSafe(localLinux && process.env.RUNNER_ENVIRONMENT === "github-hosted", "Expected GitHub-hosted Linux Docker runtime.");
  const platform = capture("docker", ["info", "--format", "{{.OSType}}/{{.Architecture}}"]);
  requireSafe(["linux/amd64", "linux/x86_64"].includes(platform), "Expected Linux amd64 Docker server.");
  capture("docker", ["version", "--format", "{{.Client.Version}}/{{.Server.Version}}"]);
}

/** @param {string[]} args @param {number} [timeout] */
function cli(args, timeout = 120_000) {
  const entry = join(dirname(require.resolve("supabase/package.json")), "dist/supabase.js");
  return capture(process.execPath, [entry, "--workdir", root, ...args], timeout);
}

function toolsGuard() {
  canonicalGuard();
  requireSafe(process.versions.node.split(".")[0] === "24", "Expected Node 24.");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  requireSafe(pkg.packageManager === "pnpm@12.11.2" && pkg.devDependencies.supabase === "2.122.0", "Tool dependency pins changed.");
  requireSafe(cli(["--version"]) === "2.122.0", "Actual Supabase CLI version mismatch.");
  dockerGuard();
}

function localGuard() {
  toolsGuard();
  const state = JSON.parse(cli(["status", "-o", "json"]));
  requireSafe(state.API_URL === "http://127.0.0.1:54321" && typeof state.ANON_KEY === "string" && !!state.ANON_KEY, "Local API identity mismatch.");
  for (const name of ["supabase_db_veni-reserve", "supabase_kong_veni-reserve"]) {
    const identity = capture("docker", ["inspect", name, "--format", '{{index .Config.Labels "com.supabase.cli.project"}}/{{.State.Running}}']);
    requireSafe(identity === "veni-reserve/true", "Local container label/state mismatch.");
  }
  return state;
}

function diskEvidence() {
  const disk = statfsSync(root);
  console.log(`Workspace available disk: ${Math.floor(disk.bavail * disk.bsize / 1024 ** 2)} MiB`);
}

async function hygiene() {
  const state = localGuard();
  const response = await globalThis.fetch(`${state.API_URL}/auth/v1/settings`, {
    redirect: "error", signal: globalThis.AbortSignal.timeout(15_000), headers: { apikey: state.ANON_KEY },
  });
  requireSafe(response.ok, "Canonical Auth settings request failed.");
  const settings = await response.json();
  const external = settings && typeof settings === "object" && "external" in settings ? settings.external : null;
  requireSafe(!!external && typeof external === "object" && "anonymous_users" in external && external.anonymous_users === false,
    "Runtime anonymous sign-in was not restored.");
  const counts = capture("docker", ["exec", "-i", "supabase_db_veni-reserve", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], 30_000,
    `select (select count(*) from auth.users) + (select count(*) from public.users) +
    (select count(*) from public.tenants) + (select count(*) from public.memberships) +
    (select count(*) from public.membership_roles) + (select count(*) from public.audit_events) +
    (select count(*) from private.invitations) + (select count(*) from private.invitation_roles) +
    (select count(*) from private.tenant_business_settings) + (select count(*) from private.tenant_business_settings_changes) + (select count(*) from public.roles where kind = 'CUSTOM');
    select count(*) from public.permissions;
    select count(*) from public.roles where kind = 'SYSTEM';
    select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id where r.kind='SYSTEM';`);
  requireSafe(counts.replaceAll("\r", "") === "0\n53\n4\n132", "Fixture/catalogue hygiene mismatch.");
  requireSafe(!readdirSync(tmpdir()).some(name => name.startsWith("veni-m12-security-")), "Security temporary directory remains.");
  console.log("Zero synthetic rows; catalogue 53/4/132; canonical Auth/config and temporary-directory hygiene: PASS");
}

async function phase() {
  const name = process.argv[2];
  requireSafe(process.argv.length === 3, "Exactly one fixed phase is required.");
  if (name === "stop" && !existsSync(marker)) {
    console.log("Startup was not attempted by this helper; cleanup not needed.");
    return;
  }
  toolsGuard();
  switch (name) {
    case "check":
      console.log("Node 24; project pnpm 12.11.2; actual Supabase CLI 2.122.0; local Linux/amd64 Docker: PASS");
      diskEvidence();
      break;
    case "start":
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, "Local startup attempted; no credentials.\n");
      cli(["start", "-x", "edge-runtime,imgproxy,logflare,vector,supavisor"], 600_000);
      localGuard();
      diskEvidence();
      break;
    case "reset":
      localGuard();
      cli(["db", "reset", "--local", "--no-seed"], 180_000);
      localGuard();
      requireSafe(capture("docker", ["exec", "-i", "supabase_db_veni-reserve", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], 30_000,
        "select version from supabase_migrations.schema_migrations order by version;").replaceAll("\r", "") ===
        "20261030154642\n20261030174937\n20261031031256\n20261103160923", "Expected four accepted migrations were not reconstructed.");
      console.log("Clean migration reconstruction: 20261030154642 / 20261030174937 / 20261031031256 / 20261103160923 PASS");
      break;
    case "hygiene":
      await hygiene();
      break;
    case "advisors": {
      localGuard();
      const output = cli(["db", "advisors", "--local", "--type", "all", "--level", "info", "--fail-on", "error", "-o", "json"]);
      // Parse findings before printing; never fall back to raw CLI output.
      const findings = JSON.parse(output);
      requireSafe(Array.isArray(findings), "Unexpected advisor response shape.");
      let hasError = false;
      for (const finding of findings) {
        requireSafe(typeof finding.name === "string" && /^[a-z0-9_]{1,100}$/.test(finding.name), "Unexpected advisor finding identifier.");
        requireSafe(["INFO", "WARN", "ERROR"].includes(finding.level), "Unexpected advisor severity.");
        console.log(`Advisor ${finding.level}: ${finding.name}`);
        hasError ||= finding.level === "ERROR";
      }
      console.log(`Local advisor findings: ${findings.length}`);
      requireSafe(!hasError, "Local advisors reported an error.");
      break;
    }
    case "stop": {
      // This fixed project ID, local daemon and canonical config were guarded above.
      // Partial startup may have no running DB/Kong, so do not require localGuard here.
      const containers = capture("docker", ["ps", "-a", "--format", "{{.Names}}"]);
      for (const name of ["supabase_db_veni-reserve", "supabase_kong_veni-reserve"]) {
        if (containers.split(/\r?\n/).includes(name))
          requireSafe(capture("docker", ["inspect", name, "--format", '{{index .Config.Labels "com.supabase.cli.project"}}']) === project,
            "Local cleanup container ownership mismatch.");
      }
      cli(["stop", "--project-id", project, "--no-backup"], 90_000);
      for (const args of [["ps", "-aq"], ["volume", "ls", "-q"], ["network", "ls", "-q"]])
        requireSafe(capture("docker", [...args, "--filter", `label=${label}`]) === "", "Project Docker resources remain after cleanup.");
      for (const args of [["ps", "-a", "--format", "{{.Names}}"], ["volume", "ls", "--format", "{{.Name}}"], ["network", "ls", "--format", "{{.Name}}"]])
        requireSafe(!capture("docker", args).split(/\r?\n/).some(name => name.startsWith("supabase_") && name.endsWith("_veni-reserve")),
          "Project Docker named resources remain after cleanup.");
      rmSync(marker);
      diskEvidence();
      break;
    }
    default:
      throw new SafeError("Unknown fixed CI phase.");
  }
}

// Importable for bounded local guard/child-failure tests; no failure-injection CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  try {
    await phase();
    console.log(`CI phase: PASS (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    // Only our fixed errors are emitted. Parser/fs/network errors are deliberately withheld.
    const safe = error instanceof SafeError;
    console.error(`CI phase: FAIL (${((Date.now() - started) / 1000).toFixed(1)}s). ${safe ? error.message : "Details withheld to protect runtime credentials."}`);
    process.exitCode = 1;
  }
}
