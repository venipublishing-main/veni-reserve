import type { CSSProperties } from "react";
import { bookingTheme } from "../booking/theme";
import type { Configuration, TeamPerson } from "./session";
const palette = ["#0f766e", "#1d4ed8", "#be123c", "#7e22ce", "#b45309", "#0369a1"];
const hash = (id: string) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 0);
export function personColour(person: TeamPerson) { return /^#[0-9a-f]{6}$/i.test(person.colour ?? "") ? person.colour! : palette[hash(person.id) % palette.length]; }
export function personEmail(person: TeamPerson) {
  const slug = person.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35) || "person";
  return person.email?.trim() || `${slug}-${hash(person.id).toString(36)}@example.test`;
}
export function staffTheme(c: Configuration, staffId: string): CSSProperties {
  const person = c.people.find(p => p.id === staffId) ?? { id: staffId, name: "", roles: [] };
  const colour = personColour(person), rgb = [1,3,5].map(i => parseInt(colour.slice(i, i + 2), 16));
  // Near-white choices must not make occupied capacity look like free white cells.
  const fill = rgb.every(v => v > 230) ? "#" + rgb.map(v => Math.floor(v * .75).toString(16).padStart(2, "0")).join("") : colour;
  const theme = bookingTheme(fill) as Record<string, string>;
  const tint = [1,3,5].map(i => Math.round(parseInt(fill.slice(i, i + 2), 16) * .12 + 255 * .88));
  return { "--staff-colour": colour, "--staff-booking": fill, "--staff-on-colour": theme["--booking-on-primary"], "--staff-buffer": `rgb(${tint.join(" ")})`, "--lane-line": fill, "--lane-ink": "#0f172a", "--lane-soft": `rgb(${tint.join(" ")})`, "--lane-faint": "#ffffff" } as CSSProperties;
}
/** Local role simulation only; production must authorize the authenticated operator server-side. */
export function canOverrideBuffer(c: Configuration, actorId: string | undefined, staffId: string) {
  const actor = c.people.find(p => p.id === actorId);
  return !!actor && c.staff.some(p => p.id === staffId) && (actor.roles.some(r => ["Owner", "Admin", "Reception"].includes(r)) || (actor.id === staffId && actor.roles.includes("Staff")));
}
export function canMoveAppointment(c: Configuration, actorId: string | undefined, sourceStaffId: string, targetStaffId: string) {
  const actor = c.people.find(p => p.id === actorId);
  if (!actor) return false;
  if (actor.roles.some(r => ["Owner", "Admin", "Reception"].includes(r))) return true;
  return actor.roles.includes("Staff") && actor.id === sourceStaffId && actor.id === targetStaffId;
}

/** Approved soft overlap remains visible; it is not a hard service/busy collision. */
export function approvedBufferOverlap(state: import("./session").SessionState,
  a: { kind: string; appointmentId?: string }, b: { kind: string; appointmentId?: string }) {
  return [ [a, b], [b, a] ].some(([buffer, other]) => buffer.kind === "buffer" && !!buffer.appointmentId &&
    state.appointments.some(p => p.id === other.appointmentId && p.bufferOverride?.appointmentIds.includes(buffer.appointmentId!)));
}
