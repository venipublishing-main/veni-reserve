import { useEffect, useState } from "react";
import { env } from "cloudflare:workers";
import type { LoaderFunctionArgs } from "react-router";
import { localReviewAllowed, privateHeaders } from "../lib/product-access.server";
import { SiteShell } from "../features/site/shell";
import { SetupReview } from "../features/site/setup-review";
import { LocalThemeStudio } from "../features/site/local-theme-studio";
export function loader({ request }: LoaderFunctionArgs) {
  if (!localReviewAllowed(request, import.meta.env.DEV, env.VENI_ENV)) throw new Response("Not found", { status: 404, headers: privateHeaders });
  return null;
}
export const headers = () => privateHeaders;
type Tenant = { id: string; status: string; display_name: string | null };
type Profile = { display_name: string; timezone: string; default_locale: string; default_currency: string; terminology: { staff_member?: { singular: string; plural: string } } };
const defaults: Profile = { display_name: "Fictional local business", timezone: "Africa/Johannesburg", default_locale: "en-ZA", default_currency: "ZAR", terminology: {} };
const button = "rounded border border-slate-500 px-4 py-2 disabled:opacity-50";
export default function LocalBusiness() {
  const [session, setSession] = useState<{ user: { id: string }; tenants: Tenant[]; request_key: string } | null>(null);
  const [selected, setSelected] = useState(""), [profile, setProfile] = useState(defaults), [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [loaded, setLoaded] = useState(false);
  async function api<T>(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`/development/local-api${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? "Sign in to the local synthetic provider." : response.status === 409 ? "Conflict: reload saved settings, or retry creation with the same request. Your unsaved input remains here." : "Request rejected or unavailable. Refresh membership/session; retry creation with the same request.");
    return value as T;
  }
  async function refresh() { try { setSession(await api<{ user: { id: string }; tenants: Tenant[]; request_key: string }>("/session")); } catch { setSession(null); } setLoaded(true); }
  useEffect(() => { void refresh(); }, []);
  async function perform(action: () => Promise<void>) { if (busy) return; setBusy(true); setMessage(""); try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : "Local operation failed"); } finally { setBusy(false); } }
  async function select(id: string) {
    const value = await api<{ settings: Profile | null; revision: number }>(`/tenants/${id}/settings`); setSelected(id); setProfile(value.settings ?? defaults); setRevision(value.revision);
  }
  return <SiteShell><h1 className="text-3xl font-semibold">Local persistent Business setup</h1>
    <p className="rounded border border-amber-400 bg-amber-50 p-4">DEVELOPMENT ONLY — actual disposable PostgreSQL and local Supabase Auth, fictional data only. Saves survive page/server reload, but a database reset destroys them. No Veni Account federation or public business activation.</p>
    {!session ? <div className="flex gap-3">{["A", "B"].map(fixture => <button key={fixture} className={button} disabled={busy || !loaded} onClick={() => void perform(async () => { await api("/signin", "POST", { fixture }); setSelected(""); await refresh(); })}>Sign in as synthetic User {fixture}</button>)}</div> : <>
      <p>Verified local User <code>{session.user.id}</code></p><button className={button} disabled={busy} onClick={() => void perform(async () => { await api("/logout", "POST"); setSession(null); setSelected(""); })}>Sign out and revoke this session</button>
      <h2 className="text-xl font-semibold">Authorized businesses</h2>
      <div className="flex flex-wrap gap-3">{session.tenants.map(t => <button className={button} disabled={busy} key={t.id} onClick={() => void perform(() => select(t.id))}>{t.display_name ?? "Unconfigured business"} · {t.status} · {t.id.slice(0, 8)}</button>)}</div>
      {!session.tenants.length && <p>No authorized businesses yet.</p>}
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void perform(async () => { const value = await api<{ tenant_id: string; replayed: boolean }>("/bootstrap", "POST", { request_key: session.request_key }); await refresh(); await select(value.tenant_id); setMessage(value.replayed ? "Existing creation recovered; no duplicate business." : "SETUP Tenant and active Owner committed atomically."); })}>Create / safely retry current business</button>
      <button className={button} disabled={busy} onClick={() => void perform(async () => { await api("/new-request", "POST"); await refresh(); setMessage("New creation request prepared. Use Create when you intend a separate business."); })}>Prepare a separate new business</button></div>
      {selected && <form className="max-w-xl space-y-3" onSubmit={e => { e.preventDefault(); void perform(async () => { const value = await api<{ settings: Profile; revision: number }>(`/tenants/${selected}/settings`, "PUT", { expected_revision: revision, settings: profile }); setProfile(value.settings); setRevision(value.revision); await refresh(); setMessage(`Saved to local PostgreSQL, revision ${value.revision}.`); }); }}>
        <h2 className="text-xl font-semibold">Canonical Business settings — revision {revision}</h2>
        {(["display_name", "timezone", "default_locale", "default_currency"] as const).map(key => <label className="block" key={key}>{key.replaceAll("_", " ")}<input required maxLength={key === "display_name" ? 120 : 80} className="block w-full rounded border p-2" value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></label>)}
        {(["singular", "plural"] as const).map(key => <label className="block" key={key}>Staff term ({key}, optional)<input className="block w-full rounded border p-2" value={profile.terminology.staff_member?.[key] ?? ""} onChange={e => { const pair = { singular: "", plural: "", ...profile.terminology.staff_member, [key]: e.target.value }; setProfile({ ...profile, terminology: pair.singular || pair.plural ? { staff_member: pair } : {} }); }} /></label>)}
        <button disabled={busy} className={button}>Save Business settings locally</button> <button type="button" disabled={busy} className={button} onClick={() => void perform(() => select(selected))}>Reload saved settings / discard edits</button>
      </form>}
    </>}
    <p role="status" aria-live="polite">{message}</p>
    {session && selected && revision > 0 && <LocalThemeStudio key={selected} tenantId={selected} />}
    <details><summary>Brand / Theme Studio — separate unsaved demonstration</summary><p>Business saves above do not save a Theme or Theme Revision. No publishing exists.</p><SetupReview /></details>
  </SiteShell>;
}
