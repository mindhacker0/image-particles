import * as THREE from 'three'
import { gsap } from 'gsap'
import { cameraControls as engineCameraControls } from '../CameraControls'
import { shared } from '../../Main'
import { atlasInstance, legacyCamera, legacyParams } from '../../legacyScope'
import { dateLabels } from '../../atlas/DateLabels'
import { type LegacyWheelEvent } from '../../utils/functions'
import { norm } from '../../utils/math'

/**
 * 时间线相机控制器。
 * 负责平面（2D）与透视（3D）时间线、curator 选择模式，以及 URL / 年份入口。
 */

/* ------------------------------------------------------------------------- *
 * 主模块共享状态。
 * 它们在模块初始化时尚未就绪，只能在调用时惰性读取。
 * ------------------------------------------------------------------------- */

/** 滚轮系数，由 `cameraControls.setState` 重新赋值。 */
function mouseWheelDeltaFactor(): number {
  return shared.mouseWheelDeltaFactor
}

/** `cameraControls.boundingBoxes` 中的一项（由 timeline 应用构建）。 */
interface TimelineBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 使用旧版 `mouseButtons` 键名的 three `OrbitControls` 接口；
 * `{ ORBIT, ZOOM, PAN }` 在当前 three 版本已不再生效。
 */
interface LegacyOrbitControls {
  enabled: boolean
  enableZoom: boolean
  enableRotate: boolean
  enablePan: boolean
  minDistance: number
  maxDistance: number
  mouseButtons: { ORBIT: number; ZOOM: number; PAN: number }
  update(): boolean
}

/** 本模块使用的 cameraControls 接口。 */
interface TimelineControlsContext {
  tweening: boolean
  orbitControls: LegacyOrbitControls
  trackball: { enabled: boolean }
  target: THREE.Object3D
  timelineWidth: number
  boundingBoxes: TimelineBoundingBox[] | null
  TIMELINE_3D: number
  TIMELINE_FLAT: number
  CURATOR_IDLE: number
  CURATOR_SELECTION: number
  CURATOR_COLOR: number
  CURATOR_TIMELINE: number
  cameraGoto(position: THREE.Vector3, duration?: number): void
  targetGoto(position: THREE.Vector3, duration?: number): void
  initFromUrl(url: string, duration?: number): void
  getPositionsFromURL(url: string): THREE.Vector3[] | null
}

function cameraControls(): TimelineControlsContext {
  return engineCameraControls as unknown as TimelineControlsContext
}

/** `atlasInstance()` 视图未包含的 `setFogDistance` / `skipAnimation`。 */
interface TimelineAtlas {
  setFogDistance(value: number, duration?: number): void
  skipAnimation(): void
}

function atlasApi(): TimelineAtlas {
  return atlasInstance() as unknown as TimelineAtlas
}

/** 时间线滚动条接口。 */
interface Timescroll {
  /** 返回指定年份区块的边界。 */
  getBoundingBoxByYear(year: number): { x: number; y: number }
}

/**
 * 传给 `mouseHandler` 的事件：原始滚轮事件（直接读取 `wheelDelta` / `deltaY`），
 * 或带 `center` 的 Hammer 事件。
 */
type TimelineControlEvent = LegacyWheelEvent & {
  type: string
  center: { x: number; y: number }
}

/** 对外暴露的 timelineControls 对象。 */
interface TimelineControls {
  axisDistance: number
  axis: THREE.Vector3
  init(): void
  setState(newState: number): void
  setFirstLocation(timescroll: Timescroll, year?: number): void
  onShift(newState: boolean): void
  mouseHandler(event: TimelineControlEvent): void
  update(tweening?: boolean): boolean | void
  constrain(): void
  selectAsset(asset: unknown): void
}

export const timelineControls: TimelineControls = (function (exports: TimelineControls) {
  let orbitControls: LegacyOrbitControls
  let target: THREE.Object3D
  let state: number
  let ready = false
  let shiftDown: boolean
  let selectedAsset: unknown
  let lowerBound = 0
  let upperBound = 0

  let box: TimelineBoundingBox | undefined
  const ZERO = new THREE.Vector3()

  const lastPoint = new THREE.Vector3()
  const deltaPoint = new THREE.Vector3()

  exports.axisDistance = 2500
  const axis2D = new THREE.Vector3(0, 0, 1)
  const axis3D = new THREE.Vector3(-1.5, 0, 0.75)
  exports.axis = axis2D

  /** 初始化：缓存共享的 orbitControls / target。 */
  exports.init = function () {
    orbitControls = cameraControls().orbitControls
    target = cameraControls().target
  }

  /** 切换到目标状态：设置轴与距离，并将相机补间到相应位置。 */
  exports.setState = function (newState: number) {
    cameraControls().trackball.enabled = false
    orbitControls.enabled = true
    orbitControls.mouseButtons = {
      ORBIT: THREE.MOUSE.RIGHT,
      ZOOM: THREE.MOUSE.MIDDLE,
      PAN: THREE.MOUSE.LEFT,
    }
    orbitControls.enableRotate = false
    orbitControls.enablePan = true
    orbitControls.enableZoom = true

    const motionDuration = 2
    selectedAsset = null
    let dest: THREE.Vector3
    state = newState
    switch (newState) {
      case cameraControls().TIMELINE_3D:
        exports.axis = axis3D

        exports.axisDistance = Math.min(
          2500,
          legacyCamera().position.distanceTo(target.position),
        )

        dest = target.position
          .clone()
          .add(axis3D.normalize().multiplyScalar(exports.axisDistance))
        cameraControls().cameraGoto(dest, motionDuration)

        atlasApi().setFogDistance(20000, motionDuration)
        gsap.to(orbitControls, { duration: motionDuration, maxDistance: 2500 })

        orbitControls.enableZoom = false
        dateLabels.hide(motionDuration)

        break

      case cameraControls().TIMELINE_FLAT:
        orbitControls.enableZoom = true

        exports.axis = axis2D

        cameraControls().cameraGoto(
          new THREE.Vector3(target.position.x, target.position.y, exports.axisDistance),
          motionDuration,
        )

        atlasApi().setFogDistance(50000, motionDuration)
        gsap.to(orbitControls, { duration: motionDuration, maxDistance: 10000 })
        dateLabels.show(motionDuration)

        break

      case cameraControls().CURATOR_SELECTION:
      case cameraControls().CURATOR_TIMELINE:
      case cameraControls().CURATOR_COLOR:
        exports.axis = axis2D
        cameraControls().cameraGoto(
          new THREE.Vector3(target.position.x, target.position.y, exports.axisDistance),
          motionDuration,
        )

        gsap.to(orbitControls, { duration: motionDuration, maxDistance: 10000 })

        break
    }

    getTimelineBoundingBox()
    ready = true
  }

  /** 将相机定位于指定年份（或 URL 指定位置）并播放入场动画。 */
  exports.setFirstLocation = function (timescroll: Timescroll, year?: number) {
    let duration = 3
    gsap.to(exports, { duration, axisDistance: 2500 })

    // 从指定年份开始
    const bounds = timescroll.getBoundingBoxByYear(year || 0)
    const center = new THREE.Vector3(bounds.x, bounds.y + 300, 0)
    const tarDest = new THREE.Vector3(center.x, center.y, 0)

    const camDest = tarDest
      .clone()
      .add(exports.axis.normalize().multiplyScalar(exports.axisDistance))

    const params = legacyParams()
    if (params.initHash && params.initHash !== '') {
      atlasApi().skipAnimation()
      cameraControls().initFromUrl(params.initHash, 0)

      const camTarget = cameraControls().getPositionsFromURL(params.initHash)
      if (camTarget) {
        exports.axisDistance = camTarget[0].distanceTo(camTarget[1] || ZERO)
        camDest.copy(camTarget[0])
        tarDest.copy(camTarget[1])
      } else {
        exports.axisDistance = orbitControls.minDistance
      }

      duration = 0
      params.initHash = ''
    }

    cameraControls().cameraGoto(camDest, duration)
    cameraControls().targetGoto(tarDest, duration)
  }

  /** 随 Shift 键在 3D 与平面时间线之间切换。 */
  exports.onShift = function (newState: boolean) {
    shiftDown = newState

    switch (state) {
      case cameraControls().TIMELINE_3D:
        if (!shiftDown) exports.setState(cameraControls().TIMELINE_FLAT)
        break

      case cameraControls().TIMELINE_FLAT:
        if (shiftDown) exports.setState(cameraControls().TIMELINE_3D)
        break
    }
  }

  /** 处理滚轮缩放与拖拽平移。 */
  exports.mouseHandler = function (event: TimelineControlEvent) {
    if (cameraControls().tweening) return
    // 此处 tweening 恒为 false（上方已对同一条件提前返回）。
    const tweening = cameraControls().tweening

    switch (event.type) {
      case 'wheel':
      case 'mousewheel':
        if (!tweening) {
          let delta = event.wheelDelta !== undefined ? -event.wheelDelta : event.deltaY * 14
          delta = delta * mouseWheelDeltaFactor()
          exports.axisDistance += delta * 0.25
          exports.axisDistance = Math.max(
            orbitControls.minDistance,
            Math.min(exports.axisDistance, orbitControls.maxDistance),
          )
        }
        break

      case 'press':
      case 'panstart':
        deltaPoint.set(0, 0, 0)
        lastPoint.set(-event.center.x, event.center.y, 0)

        break

      case 'release':
      case 'tap':
      case 'panend':
        break

      case 'pan':
        if (!tweening && state == cameraControls().TIMELINE_3D) {
          const dx = -event.center.x - lastPoint.x
          if (Math.abs(dx) > 2) {
            deltaPoint.x += dx
          }
          deltaPoint.y += event.center.y - lastPoint.y
        }

        lastPoint.set(-event.center.x, event.center.y, 0)
        break
    }
  }

  const it = 0
  /** 每帧约束相机与目标的 X / Y / Z 范围。 */
  exports.update = function (tweening?: boolean): boolean | void {
    if (!ready) return false
    if (cameraControls().tweening) return
    // 取最高点计算上边界
    getTimelineBoundingBox()

    let p: THREE.Vector3 | undefined
    const camera = legacyCamera()
    const r =
      0.01 +
      0.99 *
        norm(
          camera.position.distanceTo(target.position),
          orbitControls.minDistance,
          orbitControls.maxDistance,
        )
    deltaPoint.multiplyScalar(0.9)

    // X 轴：让相机保持在时间线边界前方
    let maxX: number
    if (cameraControls().boundingBoxes == null) {
      maxX = 100000
    } else {
      maxX = cameraControls().boundingBoxes.length == 0 ? 0 : cameraControls().timelineWidth
    }
    target.position.x = Math.min(maxX, Math.max(-15, target.position.x))

    lowerBound = -10
    if (state == cameraControls().CURATOR_TIMELINE) {
      lowerBound = 0
    }

    // Y 轴：把相机与目标限制在 0 与最高边界之间
    if (box) {
      target.position.y = Math.max(lowerBound, target.position.y)
      target.position.y = Math.min(upperBound, target.position.y)
    }

    if (
      state == cameraControls().CURATOR_IDLE ||
      state == cameraControls().CURATOR_SELECTION ||
      state == cameraControls().CURATOR_COLOR ||
      state == cameraControls().CURATOR_TIMELINE
    ) {
      camera.position.x = target.position.x
      camera.position.y = target.position.y
    }

    // Z 轴：锁定为 0
    target.position.z = 0

    if (state == cameraControls().TIMELINE_3D || state == cameraControls().TIMELINE_FLAT) {
      target.position.x += deltaPoint.x * r
      target.position.y += deltaPoint.y * r
      p = target.position
        .clone()
        .add(exports.axis.normalize().multiplyScalar(exports.axisDistance))
      camera.position.copy(p)
    }
    return orbitControls.update()
  }

  /** 约束钩子（当前为空实现）。 */
  exports.constrain = function () {
  }

  /** 根据当前 box 及其相邻 box 计算上下边界。 */
  function getTimelineBoundingBox() {
    if (cameraControls().boundingBoxes == null || cameraControls().boundingBoxes.length == 0) {
      upperBound = 100000
      lowerBound = -100000
      return
    }
    if (cameraControls().boundingBoxes.length == 1) {
      box = cameraControls().boundingBoxes[0]
      upperBound = box.height
      return box
    }

    // 若该 box 包含目标
    const x = target.position.x
    let boxId: number
    cameraControls().boundingBoxes.forEach(function (b, i, a) {
      if (x >= b.x && x <= b.x + b.width) {
        box = b
        boxId = i
      }
    })

    if (isNaN(boxId)) return

    // 结合相邻 box 计算用于限制相机的上边界
    upperBound = box.height

    const off = 15
    const cin = Math.max(0, boxId - off)
    const cout = Math.min(boxId + off, cameraControls().boundingBoxes.length)

    for (let i = cin; i < cout; i++) {
      upperBound = Math.max(upperBound, cameraControls().boundingBoxes[i].height)
    }
    upperBound += 10
  }

  /** 记录选中的素材，并调整轴距。 */
  exports.selectAsset = function (asset: unknown) {
    selectedAsset = asset
    if (asset) gsap.to(exports, { duration: 1, axisDistance: orbitControls.minDistance })
  }

  return exports
})({} as TimelineControls)
