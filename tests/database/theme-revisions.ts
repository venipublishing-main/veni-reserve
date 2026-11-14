// Genuine local Auth/PostgREST proof. No fabricated successful claims or hosted URLs.
import { randomUUID } from "node:crypto";
import console from "node:console";
import { object, sql } from "./security-local.mjs";

type Actor = { id: string; token: string };
type Context = { identity: (anonymous?: boolean) => Promise<Actor>;
  api: (path: string, token?: string, method?: string, body?: object, headers?: Record<string,string>) => Promise<Response> };
const reception = "10000000-0000-4000-8000-000000000003";
const tokens = { primary: "#244b42", accent: "#d8e9d9", typography: "system" };

export async function themeProof({ identity, api }: Context) {
  let assertions = 0;
  function check(ok: unknown, label: string) {
    if (!ok) { console.error(`Theme security FAIL: ${label}`); throw new Error("Theme security proof failed"); }
    assertions++;
  }
  const a = await identity(), b = await identity(), reader = await identity(), roleless = await identity();
  const none = await identity(), anonymous = await identity(true);
  async function rpc(name: string, actor: Actor, body: object = {}) {
    const response = await api(`/rest/v1/rpc/${name}`, actor.token, "POST", body);
    return { status: response.status, data: await response.json() as Record<string, unknown> };
  }
  async function createTenant(actor: Actor) {
    const result = await rpc("bootstrap_setup_tenant", actor, { request_key: randomUUID() });
    const value = object(result.data);
    check(result.status === 200 && typeof value.tenant_id === "string", "genuine local Auth creates SETUP Owner");
    return String(value.tenant_id);
  }
  const ta = await createTenant(a), tb = await createTenant(b);
  const readerMembership = randomUUID(), zeroMembership = randomUUID();
  sql(`begin isolation level serializable;
    insert into public.users(id) values('${reader.id}'),('${roleless.id}');
    insert into public.memberships(id,tenant_id,user_id,status) values
      ('${readerMembership}','${ta}','${reader.id}','ACTIVE'),
      ('${zeroMembership}','${ta}','${roleless.id}','ACTIVE');
    insert into public.membership_roles(membership_id,role_id) values('${readerMembership}','${reception}');
    commit;`);
  const list = (actor: Actor, tenant = ta) => rpc("list_tenant_themes", actor, { target: tenant });
  const read = (actor: Actor, theme: string, tenant = ta) => rpc("read_tenant_theme", actor, { target: tenant, theme });
  const version = (actor: Actor, theme: string, requested: number, tenant = ta) =>
    rpc("read_tenant_theme_revision", actor, { target: tenant, theme, requested });
  const save = (actor: Actor, theme: string, expected: number, design_tokens: object, tenant = ta) =>
    rpc("save_tenant_theme_revision", actor, { target: tenant, theme, expected, design_tokens });
  const initialList = object((await list(a)).data).themes;
  check(Array.isArray(initialList) && initialList.length === 0,
    "unconfigured Theme collection is private and empty");
  const made = await rpc("create_tenant_theme", a, { target: ta, theme_name: "Standard", design_tokens: tokens });
  const created = object(made.data), theme = String(created.theme_id);
  check(made.status === 200 && created.current_revision === 1 && typeof created.theme_id === "string", "first immutable private revision");
  const ownedList = object((await list(a)).data).themes;
  check(Array.isArray(ownedList) && ownedList.length === 1, "Owner lists saved Themes");
  const sharedList = object((await list(reader)).data).themes;
  check(Array.isArray(sharedList) && sharedList.length === 1,
    "themes.read-only Reception may preview private drafts");
  check(object((await read(reader, theme)).data).current_revision === 1, "read-only member can retrieve exact authorized Theme");
  for (const actor of [reader, roleless, none, anonymous, b]) {
    const result = await rpc("create_tenant_theme", actor, { target: ta, theme_name: "No write", design_tokens: tokens });
    check(["tenant_unavailable","unauthorized"].includes(String(result.data.error)), "unauthorized actor cannot create");
    check(["tenant_unavailable","unauthorized"].includes(String((await save(actor, theme, 1, tokens)).data.error)),
      "unauthorized actor cannot save");
  }
  check((await list(b)).data.error === "tenant_unavailable", "foreign tenant list denied");
  check((await read(b, theme)).data.error === "tenant_unavailable", "foreign Theme ID denied");
  check((await read(a, theme, tb)).data.error === "tenant_unavailable", "foreign context cannot be requested by Owner");
  check((await read(a, randomUUID())).data.error === "theme_unavailable", "unknown Theme ID has no details");
  check((await rpc("create_tenant_theme", a, { target: ta, theme_name: "Standard", design_tokens: tokens })).data.error === "duplicate_name",
    "duplicate active Theme name fails safely");
  for (const bad of [{ ...tokens, css: "body{}" }, { ...tokens, primary: "url(evil)" }, { ...tokens, typography: "import" }]) {
    check((await save(a, theme, 1, bad)).data.error === "invalid_input", "unapproved Theme token rejected");
  }
  const changed = { primary: "#FFFFFF", accent: "#008877", typography: "serif" };
  const after = await save(a, theme, 1, changed);
  check(after.data.current_revision === 2 && object(after.data.tokens).primary === "#ffffff", "new revision canonicalizes hex tokens");
  check((await save(a, theme, 1, tokens)).data.error === "revision_conflict", "stale revision cannot overwrite newer draft");
  check(object((await version(a, theme, 1)).data.tokens).primary === tokens.primary, "old immutable revision still available");
  check((await version(a, theme, 2)).data.revision === 2, "exact private revision is addressable");
  const racing = await Promise.all([save(a, theme, 2, tokens), save(a, theme, 2, changed)]);
  check(racing.filter(r => r.data.current_revision === 3).length === 1 &&
    racing.filter(r => r.data.error === "revision_conflict").length === 1,
  "concurrent saves use a compare-and-swap pointer");
  const snapshot = sql(`select draft_revision from private.themes where id='${theme}'`);
  check(snapshot === "3", "persisted Theme pointer advanced exactly once in race");
  check(sql(`select count(*) from private.theme_revisions where tenant_id='${ta}' and theme_id='${theme}'`) === "3",
    "all three revisions retained, none overwritten");
  check(sql(`select count(*) from private.theme_revision_events where tenant_id='${ta}' and theme_id='${theme}' and actor_user_id='${a.id}'`) === "3",
    "three attributed append-only audit events committed");
  const blocked = sql(`select count(*) from private.published_theme_assignments`);
  check(blocked === "0", "draft saves never publish");

  // A deliberate local journal failure must roll back the draft pointer and new revision.
  sql("alter table private.theme_revision_events add constraint theme_event_fault check(false) not valid");
  try {
    check((await save(a, theme, 3, tokens)).data.error === "dependency_unavailable", "journal failure sanitized");
  } finally { sql("alter table private.theme_revision_events drop constraint theme_event_fault"); }
  check(sql(`select draft_revision from private.themes where id='${theme}'`) === "3" &&
    sql(`select count(*) from private.theme_revisions where theme_id='${theme}'`) === "3",
    "failed event rolls back both pointer and revision");

  // Check FK tenant scoping through a rejected privileged synthetic diagnostic.
  let crossReferenceDenied = false;
  try {
    sql(`insert into private.theme_revisions(tenant_id,theme_id,revision,tokens,actor_user_id,actor_membership_id)
      values('${tb}','${theme}',99,'{"primary":"#244b42","accent":"#d8e9d9","typography":"system"}',
      '${b.id}',(select id from public.memberships where user_id='${b.id}' and tenant_id='${tb}'))`);
  } catch { crossReferenceDenied = true; }
  check(crossReferenceDenied && sql(`select count(*) from private.theme_revisions where revision=99`) === "0",
    "cross-tenant Theme/Revision foreign key is enforced");
  let immutable = false;
  try { sql(`update private.theme_revisions set tokens=tokens where theme_id='${theme}'`); }
  catch { immutable = true; }
  check(immutable, "immutable revision UPDATE trigger rejects even privileged mutation");

  for (const table of ["themes","theme_revisions","theme_revision_events","published_theme_assignments"]) {
    const exposed = await api(`/rest/v1/${table}`, a.token);
    check(exposed.status === 404, `private ${table} not exposed as public REST table`);
    const hidden = await api(`/rest/v1/${table}`, a.token, "GET", undefined, { "Accept-Profile": "private" });
    check(hidden.status === 406, `private ${table} schema unavailable to REST`);
  }
  check((await rpc("publish_tenant_theme", a, { target: ta, theme })).status === 404,
    "no public publication RPC exists");
  sql(`update public.memberships set status='REVOKED' where id='${readerMembership}'`);
  check((await read(reader, theme)).data.error === "tenant_unavailable", "revoked member immediately loses private Theme access");
  check((await api("/auth/v1/logout?scope=local", a.token, "POST")).ok, "provider logout revokes owner session");
  check((await read(a, theme)).data.error === "unauthorized", "revoked live session cannot read with old JWT");
  check((await save(a, theme, 3, tokens)).data.error === "unauthorized", "revoked live session cannot write with old JWT");
  check(sql("select count(*) from private.published_theme_assignments") === "0", "no unauthorized public activation");
  console.log(`Theme Revision genuine Auth/RLS/isolation/concurrency/journal tests: ${assertions} PASS`);
}
