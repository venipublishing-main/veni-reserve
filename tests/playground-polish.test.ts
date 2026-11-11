import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaygroundSession } from "../app/features/playground/session";
import { selectLocality } from "../app/features/playground/location-state";
import { LocationEditor } from "../app/features/playground/location-editor";
import { DialogDrag } from "../app/features/playground/reception-state";
import { blockPresentation, laneFamily } from "../app/features/playground/day-presentation";
import { ReceptionDialog } from "../app/features/playground/reception-dialog";

const fresh = () => structuredClone(new PlaygroundSession().getSnapshot().config);
describe("locality-first timezone", () => {
  it("applies the selected Pretoria recommendation without a second timezone confirmation", () => {
    const c = selectLocality(fresh(), "964137", false);
    expect(c.business.timezone).toBe("Africa/Johannesburg"); expect(c.business.timezoneSource).toBe("locality");
    expect(c.location.localityId).toBe("964137");
    expect(selectLocality(c, "993800", false).business.timezoneSource).toBe("locality");
  });
  it("preserves explicit and legacy manual overrides, and locked instants", () => {
    for (const source of [undefined, "manual"] as const) {
      const c = fresh(); c.business.timezone = "Europe/London"; c.business.timezoneSource = source;
      expect(selectLocality(c, "964137", false).business.timezone).toBe("Europe/London");
    }
    const c = fresh(); c.business.timezone = "Europe/London"; c.business.timezoneSource = "locality";
    expect(selectLocality(c, "964137", true).business).toEqual(c.business);
    expect(selectLocality(c, "arbitrary address Pretoria", false)).toBe(c);
  });
  it("keeps provenance through configuration cloning and clears it on hard reset", () => {
    const s = new PlaygroundSession(); s.update(selectLocality(fresh(), "964137", false));
    expect(s.getSnapshot().config.business.timezoneSource).toBe("locality");
    s.hardReset(); expect(s.getSnapshot().config.business.timezoneSource).toBeUndefined();
  });
  it("presents one primary location input and a closed manual disclosure", () => {
    const html = renderToStaticMarkup(createElement(LocationEditor, { config: selectLocality(fresh(), "964137", false), update: () => {}, locked: false }));
    expect(html).toContain("Business address, city or locality");
    expect(html).toContain("Suggested timezone"); expect(html).toContain("Africa/Johannesburg");
    expect(html).toContain('<details><summary'); expect(html).not.toContain('<details open');
    expect(html).not.toContain("Use this timezone");
  });
});
describe("bounded dialog movement", () => {
  const viewport = { width: 1366, height: 768 }, size = { width: 460, height: 400 };
  it("moves by the pointer delta without snapping the header origin", () => {
    const drag = new DialogDrag(); drag.start(4, { x: 220, y: 110 }, { x: 200, y: 100 });
    expect(drag.move(4, { x: 320, y: 210 }, viewport, size)).toEqual({ x: 300, y: 200 });
    expect(drag.move(5, { x: 0, y: 0 }, viewport, size)).toBeNull();
    expect(drag.move(4, { x: 2000, y: 2000 }, viewport, size)).toEqual({ x: 894, y: 356 });
    expect(drag.move(4, { x: -200, y: -200 }, viewport, size)).toEqual({ x: 12, y: 12 });
  });
  it("stops after release, cancel, lost capture or disposal and can start anew", () => {
    const drag = new DialogDrag(); drag.start(1, { x: 0, y: 0 }, { x: 12, y: 12 }); drag.stop();
    expect(drag.move(1, { x: 500, y: 500 }, viewport, size)).toBeNull();
    drag.start(2, { x: 20, y: 20 }, { x: 12, y: 12 });
    expect(drag.move(2, { x: 30, y: 30 }, viewport, size)).toEqual({ x: 22, y: 22 });
  });
  it("exposes a visible handle and non-drag positioning alternatives", () => {
    const html = renderToStaticMarkup(createElement(ReceptionDialog, { title: "Synthetic details", movable: true, onClose: () => {}, returnFocus: null, children: "Synthetic" }));
    for (const label of ["Drag this header", "Recentre", "Dock right", "Reset position", "arrow keys"]) expect(html).toContain(label);
  });
});
describe("day board semantics", () => {
  it("gives the three bookable lanes distinct families", () => {
    expect(new Set([0, 1, 2].map(laneFamily)).size).toBe(3);
  });
  it.each(["appointment", "buffer", "busy"])("highlights %s conflicts independently of lane colour", kind => {
    expect(blockPresentation(kind, true)).toContain("reception-block-conflict");
    expect(blockPresentation(kind, false)).not.toContain("reception-block-conflict");
    expect(blockPresentation(kind, true)).toContain(`reception-block-${kind}`);
  });
});
