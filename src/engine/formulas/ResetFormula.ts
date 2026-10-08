import type { FormulaAsset } from '../legacyScope'

/** 重置资产位置，回到初始（原点）布局。 */
export class ResetFormula {
  apply(assets: FormulaAsset[]): void {
    for (let i = 0, l = assets.length; i < l; i++) {
      assets[i].setPosition(0, 0, 0)
    }
  }
}
