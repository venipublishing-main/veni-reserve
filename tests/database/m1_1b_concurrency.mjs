import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import console from "node:console";
import { setTimeout, clearTimeout } from "node:timers";
import assert from "node:assert/strict";

const args = ["exec", "-i", "supabase_db_veni-reserve", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At"];
const owner = "10000000-0000-4000-8000-000000000001";
/** Local container only. SQL includes synthetic UUIDs, never credentials.
 * @param {string} sql */
function query(sql) {
  return execFileSync("docker", args, { input: sql, encoding: "utf8", timeout: 30_000,
    stdio: ["pipe", "pipe", "pipe"] });
}
function connection() {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  /** @type {{marker: string, resolve: (value: {output: string, state: string}) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>} | undefined} */
  let pending;
  child.stdout.on("data", chunk => {
    output += chunk.toString();
    if (pending && output.includes(pending.marker)) {
      const p = pending; pending = undefined;
      clearTimeout(p.timer);
      const value = output.slice(0, output.indexOf(p.marker));
      output = output.slice(output.indexOf(p.marker) + p.marker.length);
      p.resolve({ output: value, state: /STATE ([0-9A-Z]{5})/.exec(value)?.[1] ?? "UNKNOWN" });
    }
  });
  // SQLSTATE travels on stdout with the barrier; stderr/stdout arrival order
  // is not guaranteed and must not decide whether a transaction succeeded.
  child.stderr.resume();
  child.on("error", () => { if (pending) pending.reject(new Error("Local psql connection failed")); });
  return {
    /** @param {string} sql @returns {Promise<{output: string, state: string}>} */
    command(sql) {
      return new Promise((resolve, reject) => {
        const marker = "barrier_" + randomUUID().replaceAll("-", "");
        const timer = setTimeout(() => {
          pending = undefined; child.kill(); reject(new Error("Local race barrier timed out"));
        }, 30_000);
        pending = { marker, resolve, reject, timer };
        child.stdin.write(sql + "\n\\echo STATE :SQLSTATE\n\\echo " + marker + "\n");
      });
    },
    close() { child.stdin.end("\\q\n"); },
  };
}

/** Real independent backends, with barriers rather than timing assumptions.
 * @param {string} user1 @param {string} user2 */
export async function runConcurrency(user1, user2) {
  const tenant = randomUUID(), m1 = randomUUID(), m2 = randomUUID();
  const bootstrap = `
    begin isolation level serializable;
    insert into public.users(id) values ('${user1}'),('${user2}');
    insert into public.tenants(id,status) values ('${tenant}','ACTIVE');
    insert into public.memberships(id,tenant_id,user_id,status) values
      ('${m1}','${tenant}','${user1}','ACTIVE'),('${m2}','${tenant}','${user2}','ACTIVE');
    insert into public.membership_roles(membership_id,role_id) values
      ('${m1}','${owner}'),('${m2}','${owner}');
    commit;
  `;
  const a = connection(), b = connection();
  try {
    query("\\set ON_ERROR_STOP on\n" + bootstrap);
    const wrongIsolation = await a.command(`begin; update public.memberships set status='SUSPENDED' where id='${m1}';`);
    if (wrongIsolation.state !== "25001") throw new Error("Wrong isolation was not rejected");
    await a.command("rollback;");
    console.log("Concurrency assertion 1: wrong isolation rejected");
    const noOwner = await a.command("begin isolation level serializable; insert into public.tenants(status) values('SETUP'); commit;");
    if (noOwner.state !== "23514") throw new Error("Ownerless commit was not rejected");
    console.log("Concurrency assertion 2: actual ownerless COMMIT rejected");
    for (const [index, kind] of ["delete", "suspend"].entries()) {
      if (index) {
        query(`\\set ON_ERROR_STOP on
          begin isolation level serializable;
          update public.memberships set status='ACTIVE' where tenant_id='${tenant}';
          insert into public.membership_roles(membership_id,role_id) values
            ('${m1}','${owner}'),('${m2}','${owner}') on conflict do nothing;
          commit;`);
      }
      // Do not pre-read the Owner predicate in either racing transaction:
      // the production deferred trigger must establish the SSI dependency itself.
      const start = "begin isolation level serializable; select pg_backend_pid();";
      const begun = await Promise.all([a.command(start), b.command(start)]);
      if (begun.some(x => x.state !== "00000") || begun[0].output === begun[1].output) {
        throw new Error("Race requires two independent PostgreSQL backends");
      }
      /** @param {string} id */
      const mutation = id => kind === "delete"
        ? `delete from public.membership_roles where membership_id='${id}' and role_id='${owner}';`
        : `update public.memberships set status='SUSPENDED' where id='${id}';`;
      const changed = await Promise.all([a.command(mutation(m1)), b.command(mutation(m2))]);
      if (changed.some(x => x.state !== "00000")) throw new Error("Race mutation unexpectedly failed before commit");
      const commits = await Promise.all([a.command("commit;"), b.command("commit;")]);
      const successful = commits.filter(x => x.state === "00000" && x.output.includes("COMMIT")).length;
      const serialization = commits.filter(x => x.state === "40001").length;
      if (successful !== 1 || serialization !== 1) throw new Error("Expected one commit and one serialization failure");
      const count = query(`select count(*) from public.memberships m join public.membership_roles r on r.membership_id=m.id
        where m.tenant_id='${tenant}' and m.status='ACTIVE' and r.role_id='${owner}';`).trim();
      if (count !== "1") throw new Error("Race did not preserve one ACTIVE Owner");
      console.log(`Concurrency assertion ${index + 3}: ${kind} race: one COMMIT, one serialization failure, one ACTIVE Owner`);
    }
  } finally {
    await Promise.all([a.command("rollback;"), b.command("rollback;")]);
    a.close(); b.close();
    query(`\\set ON_ERROR_STOP on
      begin isolation level serializable;
      delete from public.membership_roles where membership_id in ('${m1}','${m2}');
      delete from public.memberships where tenant_id='${tenant}';
      delete from public.tenants where id='${tenant}';
      delete from public.users where id in ('${user1}','${user2}');
      commit;`);
    assert.equal(query(`select count(*) from public.tenants where id='${tenant}';`).trim(), "0",
      "Concurrency fixture cleanup failed");
    console.log("Concurrency assertion 5: committed fixture cleanup PASS");
  }
}
