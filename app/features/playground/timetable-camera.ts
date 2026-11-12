export const TIME_RAIL = 86, LANE_WIDTH = 120, LANE_GAP = 6;
export type Camera = { zoom: number; x: number; y: number };
export type Extent = { width: number; height: number };
const clamp = (n: number, max: number) => Math.max(0, Math.min(n, Math.max(0, max)));
export const laneLeft = (index: number) => index * (LANE_WIDTH + LANE_GAP);
export const lanesWidth = (count: number) => Math.max(0, laneLeft(count) - LANE_GAP);
export const fitZoom = (world: Extent, view: Extent) => Math.min(1, view.height / Math.max(1, world.height));
export function clampCamera(c: Camera, world: Extent, view: Extent): Camera {
  const zoom = Math.max(fitZoom(world, view), Math.min(4, c.zoom));
  return { zoom, x: clamp(c.x, world.width - view.width), y: clamp(c.y, world.height * zoom - view.height) };
}
export const screenToWorld = (c: Camera, p: { x: number; y: number }) => ({ x: p.x + c.x, y: (p.y + c.y) / c.zoom });
export const worldToScreen = (c: Camera, p: { x: number; y: number }) => ({ x: p.x - c.x, y: p.y * c.zoom - c.y });
export function zoomAt(c: Camera, factor: number, y: number, world: Extent, view: Extent) {
  const zoom = Math.max(fitZoom(world, view), Math.min(4, c.zoom * factor));
  return clampCamera({ ...c, zoom, y: screenToWorld(c, { x: 0, y }).y * zoom - y }, world, view);
}
export function wheelFactor(delta: number, mode: number, height: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
  return Math.exp(-Math.max(-160, Math.min(160, pixels)) * .003);
}
/** Resizing preserves an intentional camera; only Fit mode refits the whole day. */
export function resizeCamera(c: Camera, world: Extent, view: Extent, fitted: boolean): Camera {
  return fitted ? { zoom: fitZoom(world, view), x: 0, y: 0 } : clampCamera(c, world, view);
}
export function outsideViewport(c: Camera, item: { x: number; y: number; width: number; height: number }, view: Extent) {
  return item.x < c.x || item.x + item.width > c.x + view.width || item.y * c.zoom < c.y || (item.y + item.height) * c.zoom > c.y + view.height;
}
export function reveal(c: Camera, item: { x: number; y: number; width: number; height: number }, world: Extent, view: Extent) {
  const top = item.y * c.zoom, bottom = (item.y + item.height) * c.zoom;
  return clampCamera({ ...c, x: item.x < c.x ? item.x : item.x + item.width > c.x + view.width ? item.x + item.width - view.width : c.x,
    y: top < c.y ? top : bottom > c.y + view.height ? Math.min(top, bottom - view.height) : c.y }, world, view);
}
export const activeTimetable = (active: boolean, ownDialog: unknown, modal: unknown) => active && (!modal || ownDialog === modal);
export const acceptsWheel = (e: { ctrlKey: boolean; metaKey: boolean; cancelable: boolean }, active: boolean, excluded: boolean) => active && !excluded && e.cancelable && !e.ctrlKey && !e.metaKey;
type WheelInput = { ctrlKey: boolean; metaKey: boolean; cancelable: boolean; deltaY: number; deltaMode: number; clientY: number; preventDefault: () => void; stopPropagation: () => void };
export function handleTimetableWheel(e: WheelInput, active: boolean, excluded: boolean, height: number, top: number, zoom: (factor: number, y: number) => void) {
  if (!acceptsWheel(e, active, excluded) || !e.deltaY) return false;
  e.preventDefault(); e.stopPropagation(); zoom(wheelFactor(e.deltaY, e.deltaMode, height), e.clientY - top); return true;
}
export function horizontalWheel(e: WheelInput & { deltaX: number }, active: boolean, excluded: boolean, width: number, shift: (pixels: number) => void) {
  if (!acceptsWheel(e, active, excluded) || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return false;
  e.preventDefault(); e.stopPropagation(); shift(e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? width : 1)); return true;
}
type CaptureTarget = { setPointerCapture: (id: number) => void; hasPointerCapture: (id: number) => boolean; releasePointerCapture: (id: number) => void };
/** Gesture state is local to a viewport; a release/cancel can never become an action click. */
export class TimetablePan {
  pointer: number | null = null;
  private last = { x: 0, y: 0 };
  private suppress = false;
  private capture?: CaptureTarget;
  start(id: number, button: number, hand: boolean, point: { x: number; y: number }, capture?: CaptureTarget) {
    if (this.pointer !== null) return false;
    if (button !== 1 && !(button === 0 && hand)) { this.suppress = false; return false; }
    this.pointer = id; this.last = point; this.suppress = true; this.capture = capture; capture?.setPointerCapture(id); return true;
  }
  move(id: number, point: { x: number; y: number }) {
    if (id !== this.pointer) return null;
    const delta = { x: this.last.x - point.x, y: this.last.y - point.y }; this.last = point; return delta;
  }
  stop() { const id = this.pointer; this.pointer = null; if (id !== null && this.capture?.hasPointerCapture(id)) this.capture.releasePointerCapture(id); this.capture = undefined; }
  consumeClick() { const suppress = this.suppress; this.suppress = false; return suppress; }
}
export function previewPosition(anchor: { right: number; top: number }, bounds: { left: number; top: number; right: number; bottom: number }) {
  const width = Math.min(300, bounds.right - bounds.left), height = Math.min(220, bounds.bottom - bounds.top);
  return { left: Math.max(bounds.left, Math.min(anchor.right + 4, bounds.right - width)), top: Math.max(bounds.top, Math.min(anchor.top, bounds.bottom - height)), width, maxHeight: height };
}
