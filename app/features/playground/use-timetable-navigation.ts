import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent, MouseEvent, FocusEvent } from "react";
import { activeTimetable, resizeCamera, clampCamera, fitZoom, TimetablePan, handleTimetableWheel, reveal, zoomAt, TIME_RAIL } from "./timetable-camera";
import type { Camera, Extent } from "./timetable-camera";

const excluded = (target: EventTarget | null) => target instanceof Element && !!target.closest("input,select,textarea,[contenteditable=true],[data-navigation-ignore]");
export function useTimetableNavigation(world: Extent, active: boolean, navigation: (moving: boolean) => void) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 400, height: 320 });
  const [camera, setCamera] = useState<Camera>({ zoom: fitZoom(world, view), x: 0, y: 0 });
  const [hand, setHand] = useState(false), [dragging, setDragging] = useState(false);
  const pan = useRef(new TimetablePan()), space = useRef(false), fitted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef({ world, view, camera, active, navigation }); current.current = { world, view, camera, active, navigation };
  const allowed = () => {
    const node = viewport.current, modal = document.querySelector("dialog[open]");
    return !!node && activeTimetable(current.current.active, node.closest("dialog"), modal);
  };
  const pause = () => { clearTimeout(timer.current); current.current.navigation(true); };
  const resume = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (pan.current.pointer === null) current.current.navigation(false); }, 180); };
  const change = (fn: (c: Camera, w: Extent, v: Extent) => Camera) => {
    pause(); fitted.current = false; setCamera(c => fn(c, current.current.world, current.current.view)); resume();
  };
  const stop = () => {
    pan.current.stop();
    setDragging(false); resume();
  };
  useEffect(() => {
    const node = viewport.current; if (!node) return;
    const measure = () => {
      const v = { width: Math.max(1, node.clientWidth - TIME_RAIL), height: Math.max(1, node.clientHeight) }; setView(v);
      setCamera(c => resizeCamera(c, current.current.world, v, fitted.current));
      pause(); resume();
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    const wheel = (e: WheelEvent) => {
      handleTimetableWheel(e, allowed(), excluded(e.target), current.current.view.height, node.getBoundingClientRect().top, (factor, y) => change((c, w, v) => zoomAt(c, factor, y, w, v)));
    };
    const blur = () => { space.current = false; stop(); };
    const keyup = (e: globalThis.KeyboardEvent) => { if (e.code === "Space") { space.current = false; stop(); } };
    const escape = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape" && (pan.current.pointer !== null)) { e.preventDefault(); e.stopImmediatePropagation(); space.current = false; stop(); } };
    node.addEventListener("wheel", wheel, { passive: false }); window.addEventListener("blur", blur); window.addEventListener("keyup", keyup); document.addEventListener("keydown", escape, true);
    return () => {
      observer.disconnect(); node.removeEventListener("wheel", wheel); window.removeEventListener("blur", blur); window.removeEventListener("keyup", keyup); document.removeEventListener("keydown", escape, true);
      pan.current.stop();
      clearTimeout(timer.current); current.current.navigation(false);
    };
  // Handlers read current geometry from the ref; only one native wheel listener is installed.
  }, []);
  useEffect(() => { if (!active) { space.current = false; stop(); current.current.navigation(true); } }, [active]);
  const fit = () => { stop(); change((_c, w, v) => ({ zoom: fitZoom(w, v), x: 0, y: 0 })); fitted.current = true; };
  const zoom = (factor: number) => change((c, w, v) => zoomAt(c, factor, v.height / 2, w, v));
  const shift = (x: number, y: number) => change((c, w, v) => clampCamera({ ...c, x: c.x + x, y: c.y + y }, w, v));
  const keyboard = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || !allowed()) return;
    if (e.code === "Space") { e.preventDefault(); space.current = true; return; }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "=", "-", "Home"].includes(e.key)) return;
    e.preventDefault(); if (e.key === "Home") fit(); else if (e.key === "+" || e.key === "=") zoom(1.25); else if (e.key === "-") zoom(.8); else shift(e.key === "ArrowRight" ? 60 : e.key === "ArrowLeft" ? -60 : 0, e.key === "ArrowDown" ? 60 : e.key === "ArrowUp" ? -60 : 0);
  };
  return { viewport, camera, view, hand, dragging, fit, zoom, shift, keyboard,
    readable: () => { stop(); change((_c, w, v) => clampCamera({ zoom: 1, x: 0, y: 0 }, w, v)); },
    toggleHand: () => { stop(); setHand(h => !h); },
    viewportEvents: {
      onKeyDown: keyboard,
      onFocusCapture: (e: FocusEvent<HTMLDivElement>) => {
        if (!allowed()) return;
        const target = e.target.closest<HTMLElement>("[data-camera-y]"); if (!target) return;
        const c = current.current.camera;
        const item = { x: Number(target.dataset.cameraX ?? c.x), y: Number(target.dataset.cameraY), width: Number(target.dataset.cameraWidth ?? 0), height: Number(target.dataset.cameraHeight ?? 0) };
        const next = reveal(c, item, current.current.world, current.current.view);
        if (next.x !== c.x || next.y !== c.y) { pause(); setCamera(next); resume(); }
      },
      onPointerDownCapture: (e: PointerEvent<HTMLDivElement>) => {
        if (!allowed() || excluded(e.target)) return;
        if (!pan.current.start(e.pointerId, e.button, hand || space.current, { x: e.clientX, y: e.clientY }, e.currentTarget)) return;
        e.preventDefault(); e.stopPropagation(); pause(); fitted.current = false; setDragging(true);
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => { const d = pan.current.move(e.pointerId, { x: e.clientX, y: e.clientY }); if (d) { e.preventDefault(); pause(); setCamera(c => clampCamera({ ...c, x: c.x + d.x, y: c.y + d.y }, current.current.world, current.current.view)); } },
      onPointerUp: (e: PointerEvent<HTMLDivElement>) => { if (pan.current.pointer === e.pointerId) { e.preventDefault(); stop(); } },
      onPointerCancel: stop, onLostPointerCapture: stop,
      onMouseDownCapture: (e: MouseEvent<HTMLDivElement>) => { if (e.button === 1 && allowed() && !excluded(e.target)) e.preventDefault(); },
      onAuxClickCapture: (e: MouseEvent<HTMLDivElement>) => { if (e.button === 1 && allowed() && !excluded(e.target)) { e.preventDefault(); e.stopPropagation(); } },
      onClickCapture: (e: MouseEvent<HTMLDivElement>) => { if (pan.current.consumeClick()) { e.preventDefault(); e.stopPropagation(); } },
    },
  };
}
