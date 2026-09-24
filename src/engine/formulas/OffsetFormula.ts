import { Vector3, type Vector3 as Vector3Type } from 'three'
import type { FormulaAsset } from '../legacyScope'

export class OffsetFormula {
  private readonly offset: Vector3Type

  constructor(offset: Vector3Type) {
    this.offset = offset
  }

  apply(assets: FormulaAsset[]): void {
    const p = new Vector3()

    for (let i = 0, l = assets.length; i < l; i++) {
      const asset = assets[i]
      p.copy(asset.position)
      p.add(this.offset)
      asset.setPosition(p.x, p.y, p.z)
    }
  }
}
