import type { Color } from 'three'
import type { FormulaAsset } from '../legacyScope'

/** 把所有资产设置为同一颜色的公式。 */
export class ColorFormula {
  private readonly color: Color

  constructor(color: Color) {
    this.color = color
  }

  apply(assets: FormulaAsset[]): void {
    for (let i = 0, l = assets.length; i < l; i++) {
      const asset = assets[i]
      // 设置颜色
      asset.setColor(this.color.r, this.color.g, this.color.b)
    }
  }
}
