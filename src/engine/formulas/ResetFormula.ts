import type { FormulaAsset } from '../legacyScope'

export class ResetFormula {
  apply(assets: FormulaAsset[]): void {
    for (let i = 0, l = assets.length; i < l; i++) {
      assets[i].setPosition(0, 0, 0)
    }
  }
}
