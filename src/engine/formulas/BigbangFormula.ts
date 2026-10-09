import { Color, Vector3, type PerspectiveCamera } from 'three'
import type { Atlas } from '../atlas/Atlas'
import { PRNG } from '../atlas/utils'
import { shared } from '../Main'
import { atlasInstance, legacyCameraControls, legacyCamera, markRenderNeeded, type FormulaAsset } from '../legacyScope'
import { ColorFormula } from './ColorFormula'
import { RandomFormula, type RandomFormulaAmplitude } from './RandomFormula'

/**
 * “大爆炸”开场序列：`reset()` 先把所有资源隐藏到 berekhat ram 后方，
 * 把最旧的资源放大到随机布局中，并带动相机；`randomize()` 应用随机公式。
 *
 * `apply(assets, commit)` 中 `commit` 用于区分首次（带动画）进入与深链接进入。
 */

/** 本公式驱动的相机控制器接口。 */
interface BigbangCameraControls {
  IDLE: number
  VISUALIZER_RANDOM: number
  /** 控制器的目标 `Object3D`：本公式只用到它的 `position` */
  target: { position: Vector3 }
  setState(state: number): void
  cameraGoto(position: Vector3, duration?: number, callback?: () => void): void
}

/** 相机控制器；在调用时读取。 */
function cameraControls(): BigbangCameraControls {
  return legacyCameraControls() as unknown as BigbangCameraControls
}

/** 透视相机实例。 */
function camera(): PerspectiveCamera {
  return legacyCamera() as unknown as PerspectiveCamera
}

/** 图集实例。 */
function atlas(): Atlas {
  return atlasInstance() as unknown as Atlas
}

/** `displayIntroItem` 标志（由 Main 持有）。 */
function setDisplayIntroItem(value: boolean): void {
  shared.displayIntroItem = value
}

/** 公式的公共接口。 */
export interface BigbangFormula {
  init(app: unknown): void
  apply(assets: FormulaAsset[], commit: boolean): void
}

export const bigbangFormula: BigbangFormula = (function (exports: BigbangFormula) {
  let app: unknown
  let start: unknown

  exports.init = function (_app) {
    app = _app
  }

  exports.apply = function (assets, commit) {
    if (commit) {
      randomize()
      return
    }

    reset()
  }

  function reset() {
    cameraControls().setState(cameraControls().IDLE)
    atlas().mdLabels.labels.forEach(function (label) {
      label.fadeOut()
    })

    setDisplayIntroItem(true)
    cameraControls().target.position.set(0, 0, 0)
    camera().position.set(0, 0, 600)
    // `lookAt` 需要 Vector3：必须传入 target 的 position，否则会写入 NaN
    camera().lookAt(cameraControls().target.position)
    markRenderNeeded()

    for (let i = 0, l = atlas().assets.length; i < l; i++) {
      atlas().assets[i].setPosition(
        PRNG.random() * 2 - 1,
        8 + (PRNG.random() * 2 - 1),
        -10 - i * 0.5,
      )
      atlas().assets[i].setColor(0, 0, 0)
    }

    const oldestAsset = atlas().getOldestAsset()
    oldestAsset.setPosition(0, 0, 0)
    oldestAsset.setColor(1, 1, 1)
    atlas().skipAnimation()

    new ColorFormula(new Color(1, 1, 1)).apply(atlas().assets)
    atlas().skipAnimation()
    randomize()

    cameraControls().cameraGoto(
      new Vector3(camera().position.x, camera().position.y, 1000),
      3,
      function () {
        setDisplayIntroItem(false)
      },
    )
  }

  function randomize() {
    // 应用随机公式
    cameraControls().setState(cameraControls().VISUALIZER_RANDOM)
    // 只传入 x：'polar' 模式只读取 x，y / z 保持 undefined
    const formula = new RandomFormula(
      {
        x: 7500,
      } as RandomFormulaAmplitude,
      'polar',
      false,
    )
    formula.apply(atlas().assets)

    const oldestAsset = atlas().getOldestAsset()
    oldestAsset.setPosition(0, 0, 0)
  }

  return exports
})({} as BigbangFormula)
