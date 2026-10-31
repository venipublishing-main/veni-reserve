import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("supabase/package.json")), "dist/supabase.js");
const excluded = "edge-runtime,imgproxy,logflare,vector,supavisor";
/** @param {unknown} value @returns {Record<string, unknown>} */
export function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid response object");
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {string} cwd @param {string[]} args */
function run(cwd, args) {
  if (args[0] === "start" || args[0] === "stop" || args[0] === "db") console.log(`Local security lifecycle: ${args.join(" ")}`);
  return execFileSync(process.execPath, [cli, "--workdir", cwd, ...args], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300_000,
  });
}
/** @param {string} statement */
export function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_veni-reserve", "psql",
    "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
  }).trim();
}
/** @param {string} cwd */
function guard(cwd) {
  const config = readFileSync(join(cwd, "supabase/config.toml"), "utf8");
  if (!/^project_id = "veni-reserve"$/m.test(config)) throw new Error("Project guard failed");
  const state = JSON.parse(run(cwd, ["status", "-o", "json"]));
  if (state.API_URL !== "http://127.0.0.1:54321" || !state.ANON_KEY || !state.SERVICE_ROLE_KEY)
    throw new Error("Local URL/credential guard failed");
  const label = execFileSync("docker", ["inspect", "supabase_db_veni-reserve", "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}'], { encoding: "utf8" }).trim();
  if (label !== "veni-reserve") throw new Error("Container project guard failed");
  return state;
}

/** @typedef {{id: string, token: string}} Identity */
/** @typedef {{api: (path: string, token?: string, method?: string, body?: object, headers?: Record<string,string>) => Promise<Response>, identity: (anonymous?: boolean) => Promise<Identity>}} Context */
/** @param {(context: Context) => Promise<void>} suite */
export async function withLocalSecurity(suite) {
  let temporary;
  let stopped = false;
  let phase = "local safety guard";
  const original = readFileSync(join(root, "supabase/config.toml"), "utf8");
  try {
    guard(root);
    if (!original.includes("enable_anonymous_sign_ins = false")) throw new Error("Canonical anonymous setting changed");
    temporary = mkdtempSync(join(tmpdir(), "veni-m12-security-"));
    mkdirSync(join(temporary, "supabase"));
    writeFileSync(join(temporary, "supabase/config.toml"), original.replace(
      "enable_anonymous_sign_ins = false", "enable_anonymous_sign_ins = true"));
    cpSync(join(root, "supabase/migrations"), join(temporary, "supabase/migrations"), { recursive: true });
    phase = "temporary local Auth configuration";
    run(root, ["stop"]);
    stopped = true;
    run(temporary, ["start", "-x", excluded]);
    guard(temporary);
    phase = "guarded initial database reset";
    run(temporary, ["db", "reset", "--local", "--no-seed"]);
    // Documented local Kong loopback recovery after reset; no application/hosted changes.
    execFileSync("docker", ["restart", "supabase_kong_veni-reserve"], { stdio: "ignore" });
    const state = guard(temporary);
    /** @type {Context['api']} */
    const api = (path, token = state.ANON_KEY, method = "GET", body, headers = {}) =>
      globalThis.fetch(`${state.API_URL}${path}`, {
        method, redirect: "error", signal: globalThis.AbortSignal.timeout(15_000),
        headers: { apikey: state.ANON_KEY, Authorization: `Bearer ${token}`,
          "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    /** @type {Context['identity']} */
    const identity = async (anonymous = false) => {
      const email = `m12-${randomUUID()}@example.invalid`;
      const password = randomUUID() + randomUUID();
      if (!anonymous) {
        const created = await api("/auth/v1/admin/users", state.SERVICE_ROLE_KEY, "POST",
          { email, password, email_confirm: true });
        if (!created.ok) throw new Error(`Auth creation HTTP ${created.status}`);
      }
      const response = await api(anonymous ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password",
        undefined, "POST", anonymous ? {} : { email, password });
      if (!response.ok) throw new Error(`Auth sign-in HTTP ${response.status}`);
      const session = object(await response.json());
      const user = object(session.user);
      if (typeof session.access_token !== "string" || typeof user.id !== "string" || !/^[0-9a-f-]{36}$/.test(user.id)) throw new Error("Invalid genuine session");
      const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
      if (claims.is_anonymous !== anonymous || claims.sub !== user.id || claims.role !== "authenticated")
        throw new Error("Provider token classification contradicts AR-028; stop without weakening guard");
      return { id: user.id, token: session.access_token };
    };
    phase = "genuine provider identity guard";
    await identity();
    await identity(true);
    console.log("Genuine permanent/anonymous Auth token classification: PASS");
    phase = "real Auth/PostgREST security assertions";
    await suite({ api, identity });
  } catch (error) {
    // Never print CLI/API objects or response bodies containing session credentials.
    console.error(`Security suite failed during ${phase}.`);
    if (error instanceof Error && /^Auth (creation|sign-in) HTTP \d+$/.test(error.message)) console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (stopped && temporary) {
      try {
        guard(temporary);
        run(temporary, ["db", "reset", "--local", "--no-seed"]);
        run(temporary, ["stop"]);
        run(root, ["start", "-x", excluded]);
        guard(root);
        const counts = sql("select (select count(*) from auth.users) + (select count(*) from public.users) + (select count(*) from public.tenants) + (select count(*) from public.memberships) + (select count(*) from public.membership_roles) + (select count(*) from public.audit_events) + (select count(*) from private.invitations) + (select count(*) from private.invitation_roles) + (select count(*) from public.roles where kind = 'CUSTOM');");
        if (counts !== "0" || readFileSync(join(root, "supabase/config.toml"), "utf8") !== original) {
          console.error("Fixture/config cleanup FAILED");
          process.exitCode = 1;
        } else console.log("Guarded final reset, zero synthetic Auth/business fixtures, canonical config restored: PASS");
      } catch {
        console.error("Local cleanup/restoration FAILED; inspect local stack before proceeding.");
        process.exitCode = 1;
      }
    }
    if (temporary && dirname(resolve(temporary)) === resolve(tmpdir()) && basename(temporary).startsWith("veni-m12-security-"))
      rmSync(temporary, { recursive: true, force: true });
  }
}
