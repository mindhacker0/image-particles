import type { FormulaAsset } from '../legacyScope'

/** 螺旋布局公式：把资产沿黄金角螺旋铺在平面上，波动效果在着色器中完成。 */
export class WaveFormula {
  // 参数保留以兼容调用方
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
