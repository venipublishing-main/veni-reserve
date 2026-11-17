import { randomUUID } from "node:crypto";
import console from "node:console";
import { object, sql } from "./security-local.mjs";
type Actor = { id: string; token: string };
type Context = { identity: (anonymous?: boolean) => Promise<Actor>; api: (path: string, token?: string, method?: string, body?: object, headers?: Record<string,string>) => Promise<Response> };
export async function bootstrapProof({ identity, api }: Context) {
  let assertions = 0;
  function check(value: boolean, label: string) { if (!value) { console.error(`FAIL bootstrap: ${label}`); throw new Error("Bootstrap proof failed"); } assertions++; }
  const a = await identity(), b = await identity(), spare = await identity(), failed = await identity(), anonymous = await identity(true);
  const request = randomUUID();
  type Result = { revision?: number; settings?: { display_name?: string }; error?: string };
  async function call<T = Result>(name: string, actor: Actor, body: object = {}) {
    const response = await api(`/rest/v1/rpc/${name}`, actor.token, "POST", body);
    return { status: response.status, data: await response.json() as T };
  }
  async function bootstrap(actor: Actor, key: string) {
    for (let i = 0; i < 6; i++) {
      const result = await call("bootstrap_setup_tenant", actor, { request_key: key });
      const value = object(result.data);
      if (["40001", "23505", "40P01"].includes(String(value.code))) continue;
      return { ...result, data: value };
    }
    throw new Error("Bounded concurrent retry exhausted");
  }
  check((await call<string | null>("current_reserve_user", a)).data === a.id, "genuine Auth subject and live session");
  check((await call<string | null>("current_reserve_user", anonymous)).data === null, "anonymous provider user denied");
  check(object((await bootstrap(anonymous, randomUUID())).data).error === "unauthenticated", "anonymous cannot bootstrap");
  const race = await Promise.all([bootstrap(a, request), bootstrap(a, request), bootstrap(a, request)]);
  const ta = String(race[0].data.tenant_id);
  check(race.every(r => r.status === 200 && r.data.tenant_id === ta), "concurrent same-key requests converge");
  check(sql(`select count(*) from private.tenant_bootstrap_requests where request_key='${request}'`) === "1", "one durable receipt");
  check(sql(`select count(*) from public.tenants t join public.memberships m on m.tenant_id=t.id join public.membership_roles mr on mr.membership_id=m.id where t.id='${ta}' and t.status='SETUP' and m.status='ACTIVE' and m.user_id='${a.id}' and mr.role_id='10000000-0000-4000-8000-000000000001'`) === "1", "real active system Owner on SETUP Tenant");
  check(sql(`select count(*) from public.audit_events where tenant_id='${ta}' and actor_user_id='${a.id}' and correlation_id='${request}' and reason_code='BOOTSTRAP'`) === "2", "two scoped atomic audit events");
  const retry = await bootstrap(a, request); // Simulates delivery lost after committed response.
  check(retry.data.tenant_id === ta && retry.data.replayed === true, "ambiguous response retry never duplicates");
  check((await bootstrap(b, request)).data.error === "idempotency_conflict", "cross-user key reuse denied");
  const tb = String((await bootstrap(b, randomUUID())).data.tenant_id);
  const second = await Promise.all([bootstrap(a, randomUUID()), bootstrap(a, randomUUID())]);
  check(second.every(r => r.status === 200) && second[0].data.tenant_id !== second[1].data.tenant_id, "two explicit distinct requests create distinct owned businesses");
  const list = (actor: Actor) => call<Array<{id: string}>>("list_setup_tenants", actor);
  check((await list(a)).data.length === 3 && (await list(b)).data.length === 1, "server-resolved multi-business membership lists");
  check(!(await list(a)).data.some((t: {id: string}) => t.id === tb), "foreign Tenant absent from selection");
  const fields = { display_name: "Synthetic Persistent Clinic", timezone: "Africa/Johannesburg", default_locale: "en-ZA", default_currency: "ZAR", staff_member_singular: "Practitioner", staff_member_plural: "Practitioners" };
  const saved = await call("save_tenant_business_settings", a, { target: ta, expected_revision: 0, ...fields });
  check(saved.data.revision === 1, "canonical M2.1 first save");
  check((await call("read_tenant_business_settings", a, { target: ta })).data.settings?.display_name === fields.display_name, "new request resumes persisted settings");
  check((await call("save_tenant_business_settings", a, { target: ta, expected_revision: 0, ...fields })).data.error === "revision_conflict", "stale settings write rejected");
  check((await call("save_tenant_business_settings", a, { target: ta, expected_revision: 1, ...fields, display_name: "Edited Synthetic Clinic" })).data.revision === 2, "canonical edit revision");
  for (const name of ["read", "save"]) check((await call(`${name}_tenant_business_settings`, b, { target: ta, ...(name === "save" ? { expected_revision: 2, ...fields } : {}) })).data.error === "tenant_unavailable", `cross-user ${name} denied`);
  // User-controlled email/sub/role metadata never becomes Reserve authority.
  check((await api("/auth/v1/user", a.token, "PUT", { data: { email: "collision@example.invalid", sub: b.id, role: "owner", tenant_id: tb } })).ok, "synthetic user metadata changed");
  check((await call<string | null>("current_reserve_user", a)).data === a.id, "metadata collision does not remap UUID");
  for (const state of ["SUSPENDED", "ARCHIVED"]) {
    sql(`begin isolation level serializable; update public.tenants set status='${state}' where id='${tb}'; commit;`);
    check((await list(b)).data.length === 0, `${state} Tenant hidden`);
    check((await call("save_tenant_business_settings", b, { target: tb, expected_revision: 0, ...fields })).data.error === "tenant_unavailable", `${state} write denied`);
  }
  sql(`begin isolation level serializable; update public.tenants set status='SETUP' where id='${tb}'; insert into public.users(id) values('${spare.id}') on conflict do nothing; insert into public.memberships(tenant_id,user_id,status) values('${ta}','${spare.id}','ACTIVE'); insert into public.membership_roles select id,'10000000-0000-4000-8000-000000000001' from public.memberships where tenant_id='${ta}' and user_id='${spare.id}'; update public.memberships set status='REVOKED' where tenant_id='${ta}' and user_id='${a.id}'; commit;`);
  check(!(await list(a)).data.some((t: {id: string}) => t.id === ta), "revoked membership cannot select Tenant");
  check((await call("save_tenant_business_settings", a, { target: ta, expected_revision: 2, ...fields })).data.error === "tenant_unavailable", "revoked membership cannot save");
  sql(`begin isolation level serializable; update public.memberships set status='ACTIVE' where tenant_id='${ta}' and user_id='${a.id}'; delete from public.membership_roles where membership_id in(select id from public.memberships where tenant_id='${ta}' and user_id='${a.id}'); commit;`);
  check((await call("save_tenant_business_settings", a, { target: ta, expected_revision: 2, ...fields })).data.error === "tenant_unavailable", "active zero-role member cannot save");
  const before = sql("select count(*) from public.tenants");
  sql(`create function private.synthetic_bootstrap_failure() returns trigger language plpgsql as $$begin if new.actor_user_id='${failed.id}' then raise exception 'Synthetic rollback probe'; end if; return new; end$$; create trigger synthetic_bootstrap_failure before insert on public.audit_events for each row execute function private.synthetic_bootstrap_failure();`);
  try {
    const rejected = await bootstrap(failed, randomUUID());
    check(rejected.status >= 400, "injected audit failure rejected");
    check(sql("select count(*) from public.tenants") === before && sql(`select count(*) from public.users where id='${failed.id}'`) === "0", "whole bootstrap rolled back, including projection");
    check(sql(`select count(*) from private.tenant_bootstrap_requests where user_id='${failed.id}'`) === "0", "failed request has no committed receipt");
  } finally { sql("drop trigger synthetic_bootstrap_failure on public.audit_events; drop function private.synthetic_bootstrap_failure();"); }
  check(sql("select count(*) from public.tenants t where not exists(select from public.memberships m join public.membership_roles mr on mr.membership_id=m.id where m.tenant_id=t.id and m.status='ACTIVE' and mr.role_id='10000000-0000-4000-8000-000000000001')") === "0", "no ownerless committed Tenant");
  check((await api("/auth/v1/logout?scope=local", b.token, "POST")).ok, "genuine provider logout");
  check((await call<string | null>("current_reserve_user", b)).data === null, "revoked provider session rejected before JWT expiry");
  check((await bootstrap(b, randomUUID())).data.error === "unauthenticated", "revoked session cannot bootstrap");
  check((await call("save_tenant_business_settings", b, { target: tb, expected_revision: 0, ...fields })).data.error === "unauthorized", "revoked session cannot save using old bearer");
  check(sql("select count(*) from pg_roles where rolname='veni_bootstrap_executor' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole") === "1", "executor is nonlogin and RLS-subject");
  check(sql("select pg_has_role('authenticated','veni_bootstrap_executor','MEMBER') or pg_has_role('service_role','veni_bootstrap_executor','MEMBER')") === "f", "no privilege escalation path");
  console.log(`Tenant bootstrap: ${assertions} genuine Auth/PostgreSQL/RLS/concurrency/rollback/retry assertions PASS`);
}
