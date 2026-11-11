/** View-only semantics; never changes scheduling or time geometry. */
export function laneFamily(index: number) { return ["teal", "blue", "rose"][Math.abs(index) % 3]; }
export function blockPresentation(kind: string, conflict: boolean) {
  return `reception-block reception-block-${kind}${conflict ? " reception-block-conflict" : ""}`;
}
