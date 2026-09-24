/**
 * The `lerp` / `norm` / `map` helpers originally declared as globals in
 * `js/camera/cameraControls.js` and re-used by the atlas code.
 *
 * Keeping one copy here removes the hidden dependency on that file (and on the
 * global scope) for the ported modules.
 */

export function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a)
}

export function norm(t: number, a: number, b: number): number {
  return (t - a) / (b - a)
}

export function map(t: number, a0: number, b0: number, a1: number, b1: number): number {
  return lerp(norm(t, a0, b0), a1, b1)
}
