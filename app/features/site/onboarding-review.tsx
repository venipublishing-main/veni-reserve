import { useEffect, useState } from "react";
import { checkLabels, validDetails, validReview, type Hours, type BusinessDetails, type OnboardingReview } from "../../lib/business-onboarding";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const blank: BusinessDetails = { email: "", phone: "", hours: days.map(() => null), min_notice_minutes: 0, max_advance_days: 90 };
const control = "rounded border border-slate-400 px-3 py-2";
const button = "rounded border border-slate-500 px-4 py-2 disabled:opacity-50";
async function requestReview(url: string, method = "GET", body?: object) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" },
    body: body && JSON.stringify(body) });
  if (!response.ok) {
    if (response.status === 409) throw new Error("Saved configuration changed. Reload and review it before continuing.");
    if (response.status === 404 || response.status === 403) throw new Error("Only an active business owner can manage this onboarding draft.");
    if (response.status === 401) throw new Error("Sign in again to continue.");
    if (response.status === 422) throw new Error("Check the contact details, opening times and booking window.");
    if (response.status === 503 && url.endsWith("/activation"))
      throw new Error("Activation could not be confirmed. Reload the saved review before trying again.");
    throw new Error("Could not confirm the database result. Reload the saved draft before retrying.");
  }
  const data: unknown = await response.json();
  if (!validReview(data)) throw new Error("Could not verify the saved draft.");
  return data;
}
export function OnboardingReview({ tenantId, onActivation }: { tenantId: string; onActivation: () => Promise<void> }) {
  const url = "/api/workspace/tenants/" + tenantId + "/onboarding";
  const [review, setReview] = useState<OnboardingReview | null>(null);
  const [details, setDetails] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(details) !== JSON.stringify(review?.details ?? blank);
  function apply(saved: OnboardingReview) {
    setReview(saved);
    setDetails(saved.details ?? blank);
  }
  useEffect(() => {
    let current = true;
    requestReview(url).then(saved => { if (current) apply(saved); })
      .catch(error => { if (current) setMessage(error.message); });
    return () => { current = false; };
  }, [url]);
  async function run(action: "save" | "reload" | "activate") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      let saved: OnboardingReview;
      if (action === "save" && review) {
        if (!validDetails(details)) throw new Error("Enter valid contact details, a closing time after opening, and a booking window longer than the minimum notice.");
        saved = await requestReview(url, "PUT", { expected_revision: review.revision, details });
        setMessage("Contact details, hours and booking defaults saved.");
      } else if (action === "activate" && review) {
        saved = await requestReview(url + "/activation", "POST", { review_key: review.review_key });
        if (saved.status === "activated") await onActivation();
        setMessage(saved.status === "activated" ? "Reserve business activated." : "Activation request saved. Veni Account entitlement is pending.");
      } else {
        saved = await requestReview(url);
        setMessage("Showing the latest saved configuration.");
      }
      apply(saved);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Database unavailable. Reload to check your draft."); }
    finally { setBusy(false); }
  }
  function changeDay(index: number, slot: Hours) {
    setDetails({ ...details, hours: details.hours.map((old, i) => index === i ? slot : old) });
  }
  return <section className="max-w-3xl space-y-5">
    {review && <form className="space-y-5" onSubmit={event => { event.preventDefault(); void run("save"); }}>
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-xl font-semibold">Business contact</legend>
        <p>Provide an email address or phone number for activation.</p>
        <label className="block">Email <input className={control} type="email" maxLength={254} value={details.email}
          onChange={e => setDetails({ ...details, email: e.target.value })} /></label>
        <label className="block">Phone <input className={control} type="tel" maxLength={40} value={details.phone}
          onChange={e => setDetails({ ...details, phone: e.target.value })} /></label>
      </fieldset>
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-xl font-semibold">Weekly opening hours</legend>
        <p>Business-wide availability in {review.summary.timezone}. Leave closed days unchecked.</p>
        {days.map((day, i) => {
          const slot = details.hours[i];
          return <div key={day} className="flex flex-wrap items-center gap-3">
            <label className="w-28"><input type="checkbox" checked={!!slot} onChange={e => changeDay(i, e.target.checked ? ["09:00", "17:00"] : null)} /> {day}</label>
            {slot && <><input aria-label={day + " opening time"} className={control} required type="time" value={slot[0]} onChange={e => changeDay(i, [e.target.value, slot[1]])} />
              <span>to</span><input aria-label={day + " closing time"} className={control} required type="time" value={slot[1]} onChange={e => changeDay(i, [slot[0], e.target.value])} /></>}
          </div>;
        })}
      </fieldset>
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-xl font-semibold">Booking defaults</legend>
        <label className="block">Minimum notice (minutes) <input className={control} type="number" min="0" max="43200" required value={details.min_notice_minutes}
          onChange={e => setDetails({ ...details, min_notice_minutes: e.target.valueAsNumber })} /></label>
        <label className="block">Advance booking window (days) <input className={control} type="number" min="1" max="730" required value={details.max_advance_days}
          onChange={e => setDetails({ ...details, max_advance_days: e.target.valueAsNumber })} /></label>
      </fieldset>
      <button className={button} disabled={busy || (!dirty && review.revision > 0)}>Save draft</button>
    </form>}
    <h2 className="text-xl font-semibold">Activation review</h2>
    {review && <>
      <dl className="space-y-1">
        <dt className="font-semibold">{review.summary.business}</dt>
        <dd>Locations · {review.summary.locations.join(", ") || "None saved"}</dd>
        <dd>Services · {review.summary.services.map(s => s.name + " (" + s.minutes + " min)").join(", ") || "None saved"}</dd>
        <dd>Staff · {review.summary.staff.join(", ") || "None saved"}</dd>
      </dl>
      <ul>{(Object.keys(checkLabels) as Array<keyof typeof checkLabels>).map(key =>
        <li key={key}>{review.checks[key] ? "Complete" : "Needed"} · {checkLabels[key]}</li>)}</ul>
      <p>Saved status · {review.status === "verification_required" ? "Awaiting entitlement verification" : review.status === "activated" ? "Active" : review.status === "pending_entitlement" ? "Pending Veni Account entitlement" : "Draft"}</p>
      <p>{review.entitled === null ? "Veni Account eligibility could not be verified. You can continue saving this draft and reload the review to try again." : review.entitled ? "Veni Account has authorised Reserve activation." : "Veni Account must confirm a subscription or authorised free pilot. You can save your setup in the meantime."}</p>
    </>}
    <div className="flex flex-wrap gap-3">
      <button type="button" className={button} disabled={busy} onClick={() => void run("reload")}>{dirty ? "Discard edits and reload saved review" : "Reload saved review"}</button>
      {review && <button type="button" className={button} disabled={busy || dirty || review.entitled === null || !Object.values(review.checks).every(Boolean) ||
        review.status === "activated" || (review.status === "pending_entitlement" && !review.entitled)} onClick={() => void run("activate")}>
        {review.entitled ? "Activate business" : "Request activation"}</button>}
    </div>
    <p role="status">{message}</p>
  </section>;
}
