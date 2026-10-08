import { Vector3 } from 'three'
import { PRNG } from '../atlas/utils'
import type { FormulaAsset } from '../legacyScope'

/** 随机幅度（各轴最大值）。 */
export interface RandomFormulaAmplitude {
  x: number
  y: number
  z: number
}

export type RandomFormulaMode = 'polar' | 'cartesian'

/** 随机布局公式：支持极坐标与直角坐标两种模式。 */
export class RandomFormula {
  private readonly amp: RandomFormulaAmplitude
  private readonly hideOffset: number
  private readonly mode: RandomFormulaMode
  private readonly isRelative: boolean

  constructor(
    amp?: RandomFormulaAmplitude,
    mode?: RandomFormulaMode,
    isRelative?: boolean,
    hideOffset?: number,
  ) {
    this.amp = amp || { x: 4000, y: 4000, z: 2000 }
    this.hideOffset = hideOffset || 0
    this.mode = mode || 'polar' // polar 或 cartesian
    this.isRelative = isRelative || false
  }

  apply(assets: FormulaAsset[]): void {
    const newPosition = new Vector3()
    const method = this.isRelative ? this.add : this.set

    // 重置 PRNG 以得到相同的随机序列
    PRNG.setSeed(0)

    switch (this.mode) {
      case 'polar': {
        for (let i = 0, l = assets.length; i < l; i++) {
          const asset = assets[i]
          // 采样
          const theta = Math.acos(PRNG.random() * 2 - 1)
          const phi = PRNG.random() * Math.PI * 2
          const radius = 1 - Math.sqrt(PRNG.random()) * this.amp.x

          newPosition.x = radius * Math.sin(theta) * Math.cos(phi)
          newPosition.y = radius * Math.sin(theta) * Math.sin(phi) - this.hideOffset
          newPosition.z = radius * Math.cos(theta)

          method.call(this, asset, newPosition)
        }
        break
      }

      case 'cartesian': {
        for (let i = 0, l = assets.length; i < l; i++) {
          const asset = assets[i]

          newPosition.x = (PRNG.random() * 2 - 1) * this.amp.x
          newPosition.y = (PRNG.random() * 2 - 1) * this.amp.y - this.hideOffset
          newPosition.z = (PRNG.random() * 2 - 1) * this.amp.z

          method.call(this, asset, newPosition)
        }
        break
      }
    }
  }

  // 在当前位置上叠加随机偏移
  add(asset: FormulaAsset, coords: Vector3): void {
    coords.add(asset.position)
    asset.setPosition(coords.x, coords.y, coords.z)
  }

  // 直接设置随机位置
  set(asset: FormulaAsset, coords: Vector3): void {
    asset.setPosition(coords.x, coords.y, coords.z)
  }
}
