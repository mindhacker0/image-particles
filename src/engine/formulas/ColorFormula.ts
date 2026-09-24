import type { Color } from 'three'
import type { FormulaAsset } from '../legacyScope'

export class ColorFormula {
  private readonly color: Color

  constructor(color: Color) {
    this.color = color
  }

  apply(assets: FormulaAsset[]): void {
    for (let i = 0, l = assets.length; i < l; i++) {
      const asset = assets[i]
      // set color attribute
      asset.setColor(this.color.r, this.color.g, this.color.b)
    }
  }
}
