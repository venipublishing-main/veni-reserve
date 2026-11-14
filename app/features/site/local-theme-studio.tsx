import { useEffect, useRef, useState } from "react";
import { bookingTheme } from "../booking/theme";
import { timeButtonClass } from "../booking/time-button";
import { typography } from "./setup-draft";
import { DEFAULT_THEME_TOKENS, normalizedThemeTokens } from "../../lib/theme-revisions";
import type { ThemeRecord, ThemeSummary, ThemeTokens } from "../../lib/theme-revisions";

const button = "rounded border border-slate-500 bg-white px-4 py-2 disabled:opacity-50";
const input = "block w-full rounded border border-slate-400 bg-white p-2";
type ThemeVersion = { theme_id: string; revision: number; revision_id: string; tokens: ThemeTokens; created_at: string };

/** The only transport is the loopback-only, cookie-bound synthetic test harness. */
async function localThemeApi<T>(tenantId: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/development/local-api/tenants/${tenantId}/themes${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const code = data && typeof data === "object" && "error" in data ? String(data.error) : "unavailable";
    throw new Error(code === "revision_conflict" ? "Another edit was saved. Your unsaved changes remain; reload the saved revision before trying again."
      : code === "duplicate_name" ? "A Theme with this name already exists for this business."
      : code === "invalid_input" ? "Choose an approved name, six-digit colours and supported typography."
      : "The local Theme request was rejected. Check your membership/session and try again.");
  }
  return data as T;
}

function ThemeSample({ tokens, name }: { tokens: ThemeTokens; name: string }) {
  return <section aria-label="Private Theme preview" style={{ ...bookingTheme(tokens.primary, tokens.accent), fontFamily: typography[tokens.typography] }}
    className="space-y-3 rounded-2xl border border-slate-300 bg-white p-5">
    <h4 className="break-words text-xl font-semibold">{name || "Fictional business"}</h4>
    <p>Illustrative appointment · 30 minutes</p>
    <div className="flex gap-3"><button disabled className={timeButtonClass(false)}>09:00</button><button disabled className={timeButtonClass(true)}>10:00</button></div>
    <p className="rounded p-3" style={{ background: "var(--booking-accent)", color: "var(--booking-on-accent)" }}>Preview only — these are not bookable slots.</p>
  </section>;
}

export function LocalThemeStudio({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<ThemeSummary[]>([]), [saved, setSaved] = useState<ThemeRecord | null>(null);
  const [name, setName] = useState("Standard"), [tokens, setTokens] = useState<ThemeTokens>({ ...DEFAULT_THEME_TOKENS });
  const [historic, setHistoric] = useState<ThemeVersion | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  async function refreshList() {
    const result = await localThemeApi<{ themes: ThemeSummary[] }>(tenantId, "");
    setList(result.themes);
  }
  useEffect(() => {
    const current = ++requestId.current;
    void localThemeApi<{ themes: ThemeSummary[] }>(tenantId, "").then(result => {
      if (requestId.current === current) setList(result.themes);
    }).catch(() => { if (requestId.current === current) setStatus("Could not load private Themes. Please sign in again if your session expired."); })
      .finally(() => { if (requestId.current === current) setLoading(false); });
    return () => { requestId.current++; };
  }, [tenantId]);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setStatus("");
    try { await action(); } catch (error) { setStatus(error instanceof Error ? error.message : "Theme request failed."); }
    finally { setBusy(false); }
  }
  async function openTheme(id: string) {
    const value = await localThemeApi<ThemeRecord>(tenantId, `/${id}`);
    setSaved(value); setName(value.name); setTokens(value.tokens); setHistoric(null);
    setStatus(`Loaded private Theme revision ${value.current_revision}.`);
  }
  function startNew() {
    setSaved(null); setName("New Theme"); setTokens({ ...DEFAULT_THEME_TOKENS }); setHistoric(null);
    setStatus("New private Theme draft. Nothing has been saved yet.");
  }
  const valid = normalizedThemeTokens(tokens);
  const unsaved = !saved || JSON.stringify(valid) !== JSON.stringify(saved.tokens);

  return <section className="my-6 space-y-4 rounded-2xl border border-emerald-500 bg-emerald-50/40 p-5" aria-label="Persistent private Theme Studio">
    <h2 className="text-2xl font-semibold">Private Theme Studio — local persistence</h2>
    <p className="rounded border border-amber-400 bg-amber-50 p-3">Synthetic local business only. Saving creates an immutable Theme Revision in PostgreSQL. Drafts remain tenant-private; no logo storage, public publishing or booking activation exists here. A database reset destroys the local records.</p>
    <div className="space-y-2"><h3 className="font-semibold">Saved Themes</h3>
      <div className="flex flex-wrap gap-2">{list.map(item => <button key={item.theme_id} className={button} disabled={busy}
        aria-pressed={saved?.theme_id === item.theme_id} onClick={() => void perform(() => openTheme(item.theme_id))}>
        {item.name} · revision {item.current_revision}</button>)}
        <button className={button} disabled={busy || loading} onClick={startNew}>+ Create another Theme</button>
        <button className={button} disabled={busy || loading} onClick={() => void perform(refreshList)}>Refresh list</button>
      </div>
      {!list.length && !loading && <p>No private Themes saved yet.</p>}
    </div>
    <form onSubmit={event => { event.preventDefault(); void perform(async () => {
      if (!valid) throw new Error("Choose safe colour values and typography before saving.");
      const result = saved
        ? await localThemeApi<ThemeRecord>(tenantId, `/${saved.theme_id}`, "PUT", { expected_revision: saved.current_revision, tokens: valid })
        : await localThemeApi<ThemeRecord>(tenantId, "", "POST", { name, tokens: valid });
      setSaved(result); setName(result.name); setTokens(result.tokens); setHistoric(null);
      await refreshList(); setStatus(`Saved immutable private Theme revision ${result.current_revision}.`);
    }); }} className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block">Theme name<input className={input} maxLength={80} disabled={!!saved || busy} value={name} onChange={event => setName(event.target.value)} /></label>
        {(["primary", "accent"] as const).map(key => <label className="block capitalize" key={key}>{key} colour (#RRGGBB)
          <input className={input} required pattern="#[0-9a-fA-F]{6}" maxLength={7} disabled={busy} value={tokens[key]}
            onChange={event => setTokens({ ...tokens, [key]: event.target.value })} /></label>)}
        <label className="block">Typography<select className={input} disabled={busy} value={tokens.typography}
          onChange={event => setTokens({ ...tokens, typography: event.target.value as ThemeTokens["typography"] })}>
          <option value="system">System sans serif</option><option value="serif">System serif</option></select></label>
        <p>{saved ? `Current saved revision: ${saved.current_revision}` : "Not yet saved."} {unsaved ? "Unsaved edits are visible in the preview only." : "All current edits are saved."}</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !valid}>
          {saved ? "Save a new private revision" : "Create and save private Theme"}</button>
          <button className={button} type="button" disabled={busy} onClick={() => { setTokens({ ...DEFAULT_THEME_TOKENS }); setHistoric(null); }}>Reset unsaved controls to defaults</button>
          {saved && <button className={button} type="button" disabled={busy} onClick={() => void perform(() => openTheme(saved.theme_id))}>Discard edits / reload saved</button>}
        </div>
      </div>
      <ThemeSample tokens={valid ?? DEFAULT_THEME_TOKENS} name={name} />
    </form>
    {saved && <section className="space-y-2"><h3 className="font-semibold">Immutable revision history</h3>
      <div className="flex flex-wrap gap-2">{saved.history.map(entry => <button className={button} key={entry.revision_id} disabled={busy}
        onClick={() => void perform(async () => { const value = await localThemeApi<ThemeVersion>(tenantId, `/${saved.theme_id}/revisions/${entry.revision}`);
          setHistoric(value); setStatus(`Viewing historical revision ${value.revision} privately. The saved draft is unchanged.`); })}>
        Preview revision {entry.revision}</button>)}</div>
      {historic && <div className="grid gap-4 md:grid-cols-2"><ThemeSample tokens={historic.tokens} name={`${saved.name} — historical #${historic.revision}`} />
        <div className="space-y-3"><p>Historical revision {historic.revision} is immutable. To restore its look, copy its values into a new unsaved draft and save a new revision.</p>
          <button className={button} disabled={busy} onClick={() => { setTokens(historic.tokens); setHistoric(null); setStatus("Historical values copied into the unsaved editor. Save a new revision to retain them."); }}>Copy into unsaved editor</button>
        </div></div>}
    </section>}
    <p role="status" aria-live="polite">{status}</p>
    <button className={button} type="button" disabled>Publish — separate authorisation required</button>
  </section>;
}
