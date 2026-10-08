/** 线性插值 / 归一化 / 区间映射辅助函数，图集代码也会复用。 */

/** 线性插值。 */
export function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a)
}

/** 把 t 从 [a, b] 归一化到 [0, 1]。 */
export function norm(t: number, a: number, b: number): number {
  return (t - a) / (b - a)
}

/** 把 t 从 [a0, b0] 映射到 [a1, b1]。 */
export function map(t: number, a0: number, b0: number, a1: number, b1: number): number {
  return lerp(norm(t, a0, b0), a1, b1)
}
