import { execFileSync } from "node:child_process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { runConcurrency } from "./m1_1b_concurrency.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("supabase/package.json")), "dist/supabase.js");
/** @param {...string} args */
const run = (...args) => execFileSync(process.execPath, [cli, ...args], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000,
});

let fixtureId;
let secondFixtureId;
let temp;
let admin;
let runningTests = false;
let phase = "local CLI status";
try {
  // Only local CLI status is used. Credentials stay in memory, never arguments/files/logs.
  const state = JSON.parse(run("status", "-o", "json"));
  const url = new URL(state.API_URL);
  if (url.origin !== "http://127.0.0.1:54321" || url.pathname !== "/") {
    throw new Error("Refusing a non-project-local Auth endpoint.");
  }
  if (!state.SERVICE_ROLE_KEY) throw new Error("Local Auth admin credential unavailable.");
  /** @param {string} path @param {string} method @param {object | undefined} [body] */
  admin = async (path, method, body) => {
    const response = await globalThis.fetch(new URL(`/auth/v1/admin/users${path}`, url), {
      method, redirect: "error", signal: globalThis.AbortSignal.timeout(15_000),
      headers: {
        apikey: state.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${state.SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(`Local Auth fixture ${method}: HTTP ${response.status}`);
      throw new Error("Auth fixture request failed.");
    }
    return response;
  };
  // Supported Auth Admin API, not direct fabrication of provider rows.
  phase = "Auth fixture creation";
  const response = await admin("", "POST", {
    email: `m11a-${randomUUID()}@example.invalid`, email_confirm: true,
  });
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || !("id" in payload)
    || typeof payload.id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id)) {
    throw new Error("Invalid Auth fixture identity.");
  }
  fixtureId = payload.id;
  const second = await (await admin("", "POST", {
    email: `m11b-${randomUUID()}@example.invalid`, email_confirm: true,
  })).json();
  if (!second || typeof second !== "object" || !("id" in second)
    || typeof second.id !== "string" || !/^[0-9a-f-]{36}$/i.test(second.id)) {
    throw new Error("Invalid second Auth fixture identity.");
  }
  secondFixtureId = second.id;
  temp = mkdtempSync(join(tmpdir(), "veni-m11a-"));
  runningTests = true;
  phase = "pgTAP";
  for (const name of ["m1_1a", "m1_1b", "m1_2"]) {
    const sql = readFileSync(new URL(`./${name}.sql`, import.meta.url), "utf8")
      .replaceAll("__AUTH_USER_ID__", fixtureId)
      .replaceAll("__AUTH_USER_ID_2__", secondFixtureId);
    const testPath = join(temp, `${name}.sql`);
    writeFileSync(testPath, sql);
    console.log(run("test", "db", "--local", testPath));
  }
  phase = "two-connection concurrency";
  await runConcurrency(fixtureId, secondFixtureId);
} catch (error) {
  // CLI errors can contain connection credentials: never dump the error object/stderr.
  if (runningTests && error instanceof Error && "stdout" in error) console.error(String(error.stdout).replace(/(?:postgres(?:ql)?:\/\/\S+|eyJ[A-Za-z0-9_.-]+|sb_(?:secret|publishable)_\S+)/g, "[REDACTED]"));
  console.error(`Local database structural suite failed during ${phase}.`);
  process.exitCode = 1;
} finally {
  if (fixtureId && admin) {
    try {
      if (secondFixtureId) await admin(`/${secondFixtureId}`, "DELETE");
      await admin(`/${fixtureId}`, "DELETE");
      console.log("Auth fixture cleanup: PASS");
    } catch {
      console.error("Auth fixture cleanup failed; inspect local test identities before rerunning.");
      process.exitCode = 1;
    }
  }
  if (temp) {
    const target = resolve(temp);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("veni-m11a-")) {
      console.error("Refusing cleanup outside the test temporary directory.");
      process.exitCode = 1;
    } else {
      rmSync(target, { recursive: true, force: true });
    }
  }
}
