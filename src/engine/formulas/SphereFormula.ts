import { Vector3 } from 'three'
import type { FormulaAsset } from '../legacyScope'

/**
 * Distributes the assets with a golden-angle spiral (sunflower) layout.
 *
 * `numSpirals` is kept because the original constructor accepted it, but the
 * spiral layout that replaced the older phi/theta code no longer reads it.
 */
export class SphereFormula {
  private readonly radius: number
  private readonly numSpirals: number

  constructor(radius?: number, numSpirals?: number) {
    this.radius = radius || 4500
    this.numSpirals = numSpirals || 400
  }

  apply(assets: FormulaAsset[]): void {
    void this.numSpirals

    // from: http://www.softimageblog.com/archives/115
    const n = assets.length
    const goldenRatio = Math.PI * (3 - Math.sqrt(5))
    const off = 2 / n
    const p = new Vector3()

    for (let i = 0; i < n; i++) {
      const y = -(i * off - 1 + off / 2)
      const r = Math.sqrt(1 - y * y)
      const phi = i * goldenRatio

      assets[i].position = p.set(Math.cos(phi) * r, Math.sin(phi) * r, y).multiplyScalar(this.radius)
    }
  }
}
