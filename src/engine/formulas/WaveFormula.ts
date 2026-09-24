import type { FormulaAsset } from '../legacyScope'

/** Ported from `js/atlas/formulas/wave_formula.js` (golden angle spiral). */
export class WaveFormula {
  constructor(_amp?: unknown) {}

  apply(assets: FormulaAsset[]): void {
    const size = Math.sqrt(assets.length)
    const margin = 20

    const half = (size + 1) * margin * 0.5
    const radius = margin - half

    const n = assets.length
    let theta = 0
    let r = 0
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))

    for (let i = 0; i < n; i++) {
      const asset = assets[i]
      theta = i * goldenAngle
      r = (Math.sqrt(i) / Math.sqrt(n)) * radius
      asset.setPosition(r * Math.cos(theta), 0, r * Math.sin(theta))
    }
  }
}
