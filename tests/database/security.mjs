import console from "node:console";
import { randomUUID } from "node:crypto";
import { object, sql, withLocalSecurity } from "./security-local.mjs";

const readTables = ["tenants", "users", "memberships", "roles", "role_permissions", "membership_roles", "audit_events"];
let assertions = 0;
/** @param {boolean} condition @param {string} label */
function check(condition, label) {
  if (!condition) { console.error(`FAIL: ${label}`); throw new Error("Security assertion failed"); }
  assertions++;
}
/** @param {string} statement */
const mutate = (statement) => sql(`begin isolation level serializable; ${statement}; commit;`);

await withLocalSecurity(async ({ api, identity }) => {
  const a = await identity(), b = await identity(), c = await identity();
  const zero = await identity(), suspended = await identity(), revoked = await identity();
  const none = await identity(), anonymous = await identity(true), spare = await identity();
  const ta = randomUUID(), tb = randomUUID(), ra = randomUUID(), rb = randomUUID(), redundant = randomUUID();
  const ma = randomUUID(), mb = randomUUID(), mca = randomUUID(), mcb = randomUUID();
  const mz = randomUUID(), ms = randomUUID(), mr = randomUUID(), man = randomUUID(), mo = randomUUID();
  const ea = randomUUID(), eb = randomUUID(), invitation = randomUUID();
  const owner = "10000000-0000-4000-8000-000000000001";
  const admin = "10000000-0000-4000-8000-000000000002";
  const staff = "10000000-0000-4000-8000-000000000004";
  mutate(`
    insert into public.users(id) values ${[a,b,c,zero,suspended,revoked,none,anonymous,spare].map(u => `('${u.id}')`).join(",")};
    insert into public.tenants(id,status) values ('${ta}','ACTIVE'),('${tb}','ACTIVE');
    insert into public.memberships(id,tenant_id,user_id,status) values
      ('${ma}','${ta}','${a.id}','ACTIVE'),('${mb}','${tb}','${b.id}','ACTIVE'),
      ('${mca}','${ta}','${c.id}','ACTIVE'),('${mcb}','${tb}','${c.id}','ACTIVE'),
      ('${mz}','${ta}','${zero.id}','ACTIVE'),('${ms}','${ta}','${suspended.id}','SUSPENDED'),
      ('${mr}','${ta}','${revoked.id}','REVOKED'),('${man}','${ta}','${anonymous.id}','ACTIVE'),
      ('${mo}','${ta}','${spare.id}','ACTIVE');
    insert into public.roles(id,kind,tenant_id,code,display_name) values
      ('${ra}','CUSTOM','${ta}','security_a','Synthetic A'),
      ('${rb}','CUSTOM','${tb}','security_b','Synthetic B'),
      ('${redundant}','CUSTOM','${ta}','security_redundant','Synthetic redundant');
    insert into public.role_permissions(role_id,permission_code) values
      ('${ra}','tenant.read'),('${ra}','members.read'),('${ra}','audit.read'),
      ('${rb}','tenant.read'),('${redundant}','tenant.read');
    insert into public.membership_roles(membership_id,role_id) values
      ('${ma}','${ra}'),('${mb}','${owner}'),('${mo}','${owner}'),
      ('${mca}','${admin}'),('${mcb}','${rb}'),('${man}','${owner}'),
      ('${ms}','${admin}'),('${mr}','${admin}');
    insert into public.audit_events(id,tenant_id,action,actor_type,service_actor,reason_code,target_type,target_id,correlation_id) values
      ('${ea}','${ta}','membership.activated','SERVICE','trusted_bootstrap','BOOTSTRAP','membership','${ma}','${randomUUID()}'),
      ('${eb}','${tb}','membership.activated','SERVICE','trusted_bootstrap','BOOTSTRAP','membership','${mb}','${randomUUID()}');
    insert into private.invitations(id,tenant_id,target_email,inviter_user_id,inviter_membership_id,expires_at,request_key,request_fingerprint,token_verifier)
      values ('${invitation}','${ta}','synthetic-invite@example.invalid','${spare.id}','${mo}',now()+interval '168 hours','${randomUUID()}',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'));
    insert into private.invitation_roles(invitation_id,role_id) values ('${invitation}','${staff}');
  `);
  /** @param {string} route @param {string} token @param {number} expected @param {string} label */
  async function rows(route, token, expected, label) {
    const response = await api(`/rest/v1/${route}`, token);
    const data = await response.json();
    check(response.status === 200 && Array.isArray(data) && data.length === expected, label);
    if (!Array.isArray(data)) throw new Error("Expected rows");
    return data.map(object);
  }
  /** @param {{id:string,token:string}} user @param {string | undefined} membership @param {string} label */
  async function statusOnly(user, membership, label) {
    for (const table of readTables) {
      const expected = table === "users" ? 1 : table === "memberships" && membership ? 1 : 0;
      const data = await rows(table, user.token, expected, `${label}: ${table}`);
      if (table === "users") check(data[0].id === user.id, `${label}: own user only`);
      if (table === "memberships" && membership) check(data[0].id === membership, `${label}: own membership only`);
    }
  }
  for (const table of [...readTables, "permissions"]) {
    const response = await api(`/rest/v1/${table}`);
    const body = object(await response.json());
    check(response.status === 401 && body.code === "42501", `anon SELECT privilege denied: ${table}`);
  }
  for (const table of readTables) await rows(table, anonymous.token, 0, `anonymous Auth denied despite Owner fixture: ${table}`);
  await statusOnly(none, undefined, "no membership");
  await statusOnly(zero, mz, "zero roles");
  await statusOnly(suspended, ms, "suspended");
  await statusOnly(revoked, mr, "revoked");
  console.log("Anon, anonymous Auth, no-member, zero-role, inactive self-status: PASS");

  await rows(`tenants?id=eq.${ta}`, a.token, 1, "A authorized tenant");
  await rows(`users?id=neq.${a.id}`, a.token, 0, "members.read never exposes global peer users");
  await rows(`memberships?tenant_id=eq.${ta}`, a.token, 7, "A directory includes inactive peers");
  await rows(`roles?id=eq.${ra}`, a.token, 1, "A custom role");
  await rows(`audit_events?id=eq.${ea}`, a.token, 1, "A audit");
  for (const route of [`tenants?id=eq.${tb}`, `memberships?tenant_id=eq.${tb}`, `memberships?id=eq.${mb}`,
    `roles?id=eq.${rb}`, `role_permissions?role_id=eq.${rb}`, `membership_roles?membership_id=eq.${mb}`, `audit_events?id=eq.${eb}`]) {
    await rows(route, a.token, 0, `foreign-ID denial: ${route.split("?")[0]}`);
    const count = await api(`/rest/v1/${route}`, a.token, "HEAD", undefined, { Prefer: "count=exact" });
    check(count.ok && count.headers.get("content-range")?.endsWith("/0") === true, "Foreign HEAD exact count is zero");
    const singular = await api(`/rest/v1/${route}`, a.token, "GET", undefined, { Accept: "application/vnd.pgrst.object+json" });
    check(singular.status === 406 && object(await singular.json()).code === "PGRST116", "Foreign singular form has no result");
  }
  await rows(`tenants?id=eq.${ta}`, b.token, 0, "B cannot read A");
  await rows(`roles?id=eq.${ra}`, b.token, 0, "B cannot read A custom role");
  await rows("tenants?order=id&limit=1&offset=0", a.token, 1, "ordered paginated A result");
  await rows("tenants?order=id&limit=1&offset=1", a.token, 0, "pagination does not reach B");
  await rows("tenants", c.token, 2, "C has independent tenant.read in A and B");
  await rows(`memberships?tenant_id=eq.${ta}`, c.token, 7, "C A admin directory");
  await rows(`memberships?tenant_id=eq.${tb}`, c.token, 1, "C B only own membership");
  await rows(`audit_events?tenant_id=eq.${ta}`, c.token, 1, "C A audit");
  await rows(`audit_events?tenant_id=eq.${tb}`, c.token, 0, "C A audit permission cannot authorize B");
  await rows(`membership_roles?membership_id=eq.${mb}`, c.token, 0, "C cannot read B peer assignments");
  console.log("A/B isolation, foreign-ID/count/HEAD/singular/pagination, independent multi-tenant authority: PASS");

  // Both direct and FK embedded joins exercise the full acyclic policy graph.
  const embedded = await rows("memberships?select=id,tenant_id,users(id),membership_roles(role_id,roles(id,role_permissions(permission_code)))", a.token, 7, "nested authorization graph is nonrecursive");
  check(embedded.every(row => row.tenant_id === ta && (row.users === null || object(row.users).id === a.id)), "nested peer global users remain hidden");
  await rows(`memberships?select=id,tenants!inner(id)&tenants.id=eq.${tb}`, a.token, 0, "foreign inner join blocked");
  await rows(`roles?select=id,role_permissions!inner(permission_code)&id=eq.${rb}`, a.token, 0, "foreign role mapping inner join blocked");
  await rows("role_permissions?select=permission_code,roles!inner(id)&roles.kind=eq.CUSTOM", a.token, 4, "authorized role mappings nested read");
  console.log("Direct and nested memberships/assignments/roles/mappings recursion checks: PASS");

  await rows("tenants", a.token, 1, "baseline identical request before same-token membership revocation");
  for (const state of ["SUSPENDED", "REVOKED"]) {
    mutate(`update public.memberships set status='${state}' where id='${ma}'`);
    await statusOnly(a, ma, `same unchanged token after ${state}`);
    mutate(`update public.memberships set status='ACTIVE' where id='${ma}'`);
    await rows("tenants", a.token, 1, "identical request restored before next state transition");
    await rows(`tenants?id=eq.${ta}`, a.token, 1, "same token restored active authority");
  }
  mutate(`delete from public.membership_roles where membership_id='${ma}' and role_id='${ra}'`);
  await statusOnly(a, ma, "same token role removed");
  mutate(`insert into public.membership_roles values ('${ma}','${ra}',now()),('${ma}','${redundant}',now())`);
  await rows(`tenants?id=eq.${ta}`, a.token, 1, "same token role added");
  mutate(`delete from public.role_permissions where role_id='${ra}' and permission_code='tenant.read'`);
  await rows(`tenants?id=eq.${ta}`, a.token, 1, "redundant explicit grant survives removal");
  mutate(`delete from public.membership_roles where membership_id='${ma}' and role_id='${redundant}'`);
  await rows(`tenants?id=eq.${ta}`, a.token, 0, "last grant removed next request");
  mutate(`insert into public.role_permissions values ('${ra}','tenant.read')`);
  await rows(`tenants?id=eq.${ta}`, a.token, 1, "same token custom mapping addition");
  await rows("audit_events", a.token, 1, "baseline identical audit request before permission removal");
  mutate(`delete from public.role_permissions where role_id='${ra}' and permission_code='audit.read'`);
  await rows("audit_events", a.token, 0, "same token audit.read removed");
  mutate(`insert into public.role_permissions values ('${ra}','audit.read')`);
  await rows("audit_events", a.token, 1, "same token audit.read restored");
  mutate(`delete from public.role_permissions where role_id='${ra}' and permission_code='members.read'`);
  await rows("memberships", a.token, 1, "directory removed immediately");
  await rows(`roles?id=eq.${ra}`, a.token, 1, "own assigned custom role visible without directory capability");
  await rows(`roles?id=eq.${redundant}`, a.token, 0, "unassigned custom role hidden without directory capability");
  await rows(`roles?id=eq.${owner}`, a.token, 0, "unassigned system role hidden without directory capability");
  mutate(`insert into public.membership_roles values ('${ma}','${staff}',now())`);
  await rows(`roles?id=eq.${staff}`, a.token, 1, "own assigned SYSTEM role visible");
  mutate(`delete from public.membership_roles where membership_id='${ma}' and role_id='${staff}'; insert into public.role_permissions values ('${ra}','members.read')`);
  console.log("Same-token suspension/revocation, multi-role union, role/mapping add/remove and audit loss: PASS");

  for (const state of ["SETUP", "SUSPENDED", "ARCHIVED", "ACTIVE"]) {
    mutate(`update public.tenants set status='${state}' where id='${ta}'`);
    await rows(`tenants?id=eq.${ta}`, a.token, 1, `${state} minimal tenant metadata remains visible`);
    const enabled = state === "SETUP" || state === "ACTIVE";
    await rows("memberships", a.token, enabled ? 7 : 1, `${state} directory/self-status`);
    await rows("audit_events", a.token, enabled ? 1 : 0, `${state} audit lifecycle`);
    for (const table of ["roles", "role_permissions", "membership_roles"]) {
      const response = await api(`/rest/v1/${table}`, a.token);
      const data = await response.json();
      check(response.ok && Array.isArray(data) && (enabled ? data.length > 0 : data.length === 0), `${state} ${table}`);
    }
  }
  console.log("SETUP/ACTIVE and SUSPENDED/ARCHIVED lifecycle boundaries: PASS");

  // Compare full application snapshots in memory; never print history/private data.
  const allTables = [...readTables.map(t => `public.${t}`), "public.permissions", "private.invitations", "private.invitation_roles"];
  const snapshot = () => sql(allTables.map(t => `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text from ${t} t;`).join("\n"));
  const before = snapshot();
  /** @type {Record<string, object>} */
  const bodies = {
    tenants: { id: ta, status: "ARCHIVED" }, users: { id: a.id },
    memberships: { id: ma, status: "REVOKED" }, roles: { id: ra, display_name: "Denied mutation" },
    role_permissions: { role_id: ra, permission_code: "tenant.read" },
    membership_roles: { membership_id: ma, role_id: ra },
    audit_events: { id: ea, action: "membership.revoked" },
    permissions: { code: "tenant.read", description: "Denied mutation" },
  };
  for (const token of [undefined, a.token, anonymous.token]) {
    for (const table of [...readTables, "permissions"]) {
      for (const method of ["POST", "PATCH", "DELETE", "UPSERT"]) {
        // The local provider's safe-update extension rejects unfiltered mutations
        // before ACL evaluation. Target a real fixture to prove grant-layer denial.
        const key = table === "role_permissions" ? "role_id" : table === "membership_roles" ? "membership_id" : table === "permissions" ? "code" : "id";
        const target = object(bodies[table])[key];
        const response = await api(`/rest/v1/${table}?${key}=eq.${target}`, token, method === "UPSERT" ? "POST" : method,
          method === "DELETE" ? undefined : bodies[table], method === "UPSERT" ? { Prefer: "resolution=merge-duplicates" } : {});
        const body = object(await response.json());
        check((response.status === 401 || response.status === 403) && body.code === "42501", `${table} ${method}: actual privilege denial (HTTP ${response.status}; code ${typeof body.code === "string" && /^[A-Z0-9]+$/.test(body.code) ? body.code : "unclassified"})`);
      }
    }
  }
  check(snapshot() === before, "all denied mutations leave exact ten-table state unchanged");
  for (const token of [undefined, a.token, anonymous.token]) {
    for (const table of ["invitations", "invitation_roles"]) {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        const response = await api(`/rest/v1/${table}`, token, method,
          method === "POST" || method === "PATCH" ? {} : undefined,
          { "Accept-Profile": "private", "Content-Profile": "private" });
        check(response.status === 406 && object(await response.json()).code === "PGRST106", `private ${table} ${method} schema not exposed`);
      }
      const guessed = await api(`/rest/v1/${table}`, token);
      check(guessed.status === 404, "private table cannot be guessed in public schema");
    }
    for (const helper of ["business_user_id", "current_membership_id", "has_active_membership", "has_capability", "tenant_access_enabled", "can_read_membership", "can_read_membership_roles", "can_read_role", "owner_write_guard"]) {
      const response = await api(`/rest/v1/rpc/${helper}`, token, "POST", {});
      check(response.status === 404 && object(await response.json()).code === "PGRST202", `no public helper RPC: ${helper}`);
      const privateRpc = await api(`/rest/v1/rpc/${helper}`, token, "POST", {}, { "Content-Profile": "private" });
      check(privateRpc.status === 406 && object(await privateRpc.json()).code === "PGRST106", `no private RPC schema: ${helper}`);
    }
  }
  check(snapshot() === before, "private probes leave exact application state unchanged");
  console.log("POST/PATCH/DELETE/upsert denied at grants; private tables/schema/helper RPC probes: PASS");
  // Representative actual restricted-role plans, using real identity claims for SQL-only diagnostics.
  // The HTTP evidence above always used genuine signed tokens, never these GUCs.
  for (const table of ["memberships", "membership_roles", "roles", "role_permissions"]) {
    const plan = sql(`begin; set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"${a.id}","is_anonymous":false}',true);
      explain (analyze, buffers, format json) select * from public.${table}; rollback;`);
    check(plan.includes('"Execution Time"') && !plan.includes('"Node Type": "Recursive Union"'), `restricted ${table} plan executes without recursion`);
    const timing = plan.match(/"Execution Time": ([\d.]+)/)?.[1];
    console.log(`Restricted-role plan ${table}: execution ${timing} ms (small synthetic fixture; no scale claim)`);
  }
  console.log(`Real Auth/PostgREST security assertions: ${assertions} PASS`);
});
