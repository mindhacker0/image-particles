import * as THREE from 'three'
import { gsap } from 'gsap'
import { cameraControls as engineCameraControls } from '../CameraControls'
import { shared } from '../../Main'
import { legacyCamera, legacyScene } from '../../legacyScope'
import { normalizeWheel, type LegacyWheelEvent } from '../../utils/functions'
import { lerp, map, norm } from '../../utils/math'

/**
 * 默认相机控制器。
 * 处理 curator 桌面的拖拽与滚轮、random / sphere 可视化器使用的 trackball 接管，
 * 以及 waves 布局的极角限制。
 */

/** 角度常量（本地定义，避免对引入顺序的依赖）。 */
const PI = Math.PI
const RAD = Math.PI / 180

/* ------------------------------------------------------------------------- *
 * 主模块共享状态。
 * 它们在模块初始化时尚未就绪，只能在调用时惰性读取。
 * ------------------------------------------------------------------------- */

/**
 * CuratorChapter（curator 桌面的 rasterfairy 边界）未在本构建中定义，
 * CURATOR_IDLE 拖拽分支访问它时会抛 ReferenceError。
 */
declare const CuratorChapter: { min: { x: number; y: number }; max: { x: number; y: number } }

/** 滚轮系数，由 `cameraControls.setState` 重新赋值。 */
function mouseWheelDeltaFactor(): number {
  return shared.mouseWheelDeltaFactor
}

/**
 * 使用旧版 `mouseButtons` 键名的 three `OrbitControls` 接口。
 *
 * 注意：npm 版 `OrbitControls`（r150+）使用 `{ LEFT, MIDDLE, RIGHT }`，
 * 不再读取 `ORBIT` / `ZOOM` / `PAN`，下面的赋值不会生效。
 */
interface LegacyOrbitControls {
  enabled: boolean
  enableZoom: boolean
  enableRotate: boolean
  enablePan: boolean
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
  mouseButtons: { ORBIT: number; ZOOM: number; PAN: number }
  update(): boolean
}

/** 本模块使用的 three `TrackballControls` 接口。 */
interface LegacyTrackballControls {
  enabled: boolean
  enableRotate: boolean
  enableZoom: boolean
  minDistance: number
  maxDistance: number
  rotateSpeed: number
  zoomSpeed: number
  update(): boolean
}

/** 本模块使用的 cameraControls 接口。 */
interface DefaultControlsContext {
  tweening: boolean
  orbitControls: LegacyOrbitControls
  trackball: LegacyTrackballControls
  target: THREE.Object3D
  IDLE: number
  VISUALIZER_RANDOM: number
  VISUALIZER_SPHERE: number
  VISUALIZER_WAVES: number
  CURATOR_IDLE: number
  targetGoto(position: THREE.Vector3, duration?: number): void
  forceLod(): void
}

function cameraControls(): DefaultControlsContext {
  return engineCameraControls as unknown as DefaultControlsContext
}

/**
 * 传给 `mouseHandler` 的事件：经 `normalizeWheel` 规范化的滚轮事件，
 * 或带 `center` 的 Hammer 事件。
 */
type DefaultControlEvent = LegacyWheelEvent & {
  type: string
  center: { x: number; y: number }
}

/** 对外暴露的 defaultControls 对象。 */
interface DefaultControls {
  axis: THREE.Vector3
  distance: number
  /**
   * 运行时未初始化：滚轮分支直接读写它，因此缩放会使其变为 `NaN`。
   */
  axisDistance: number
  init(): void
  setState(newState: number): void
  onShift(newState: boolean): void
  mouseHandler(event: DefaultControlEvent): void
  update(): boolean | void
  constrain(): void
  selectAsset(asset: unknown): void
}

export const defaultControls: DefaultControls = (function (exports: DefaultControls) {
  let orbitControls: LegacyOrbitControls
  let trackball: LegacyTrackballControls
  let target: THREE.Object3D
  let state: number
  let ready = false
  let shiftDown: boolean

  let selectedAsset: unknown
  const ZERO = new THREE.Vector3()

  exports.axis = new THREE.Vector3(0, 0.25, 1).normalize()
  exports.distance = 15000

  /** 初始化：缓存共享的 orbitControls / trackball / target。 */
  exports.init = function () {
    orbitControls = cameraControls().orbitControls
    trackball = cameraControls().trackball
    target = cameraControls().target
  }

  /** 切换到目标状态，并按状态调整 trackball / orbitControls 参数。 */
  exports.setState = function (newState: number) {
    state = newState
    trackball.enabled = false
    orbitControls.enabled = true

    gsap.killTweensOf(orbitControls)
    switch (state) {
      case cameraControls().VISUALIZER_RANDOM:
      case cameraControls().VISUALIZER_SPHERE:
        trackball.enabled = true
        trackball.enableRotate = true
        trackball.enableZoom = true
        orbitControls.enabled = false
        orbitControls.enableZoom = false
        cameraControls().targetGoto(ZERO, 1)

        if (state == cameraControls().VISUALIZER_SPHERE) {
          gsap.to(trackball, { duration: 1, minDistance: 4540 })
        }

        break

      case cameraControls().VISUALIZER_WAVES:
        gsap.to(orbitControls, {
          duration: 10,
          minDistance: 1000,
          minPolarAngle: PI * 0.5 - RAD * 30,
          maxPolarAngle: PI * 0.5,
        })
        break

      case cameraControls().CURATOR_IDLE:
        orbitControls.minPolarAngle = RAD * 5
        orbitControls.maxPolarAngle = PI * 0.5 - RAD * 5
        orbitControls.maxDistance = 10000

        orbitControls.mouseButtons = {
          ORBIT: THREE.MOUSE.RIGHT,
          ZOOM: THREE.MOUSE.MIDDLE,
          PAN: THREE.MOUSE.LEFT,
        }
        orbitControls.enableRotate = false
        orbitControls.enablePan = true

        break
    }
    ready = true
  }

  /** 同步 Shift 键状态，并按当前状态重新映射鼠标按键。 */
  exports.onShift = function (newState: boolean) {
    shiftDown = newState

    orbitControls.mouseButtons = {
      ORBIT: THREE.MOUSE.RIGHT,
      ZOOM: THREE.MOUSE.MIDDLE,
      PAN: THREE.MOUSE.RIGHT,
    }
    orbitControls.enableZoom = true

    switch (state) {
      case cameraControls().IDLE:
        orbitControls.enableZoom = false
        break

      case cameraControls().VISUALIZER_WAVES:
        orbitControls.mouseButtons.ORBIT = THREE.MOUSE.LEFT
        break
    }

    orbitControls.enableRotate = orbitControls.mouseButtons.ORBIT == THREE.MOUSE.LEFT
    orbitControls.enablePan = orbitControls.mouseButtons.PAN == THREE.MOUSE.LEFT
  }

  const lastMouse = new THREE.Vector2()
  const drag = new THREE.Vector3()

  /** 处理滚轮、按下与拖拽事件。 */
  exports.mouseHandler = function (event: DefaultControlEvent) {
    if (cameraControls().tweening) return

    switch (event.type) {
      case 'wheel':
      case 'mousewheel': {
        // 注意：exports.axisDistance 未初始化，这里的结果为 NaN。
        const delta = -normalizeWheel(event).spinY * mouseWheelDeltaFactor()

        exports.axisDistance += delta * 0.25
        exports.axisDistance = Math.max(
          orbitControls.minDistance,
          Math.min(exports.axisDistance, orbitControls.maxDistance),
        )

        break
      }

      case 'press':
      case 'panstart':
        lastMouse.set(event.center.x, event.center.y)

        break

      case 'release':
      case 'tap':
      case 'panend':
        lastMouse.set(0, 0)
        break

      case 'pan': {
        const camera = legacyCamera()

        if (!cameraControls().tweening && !shiftDown && state == cameraControls().CURATOR_IDLE) {
          let dx = target.position.x - camera.position.x
          let dy = target.position.z - camera.position.z
          const angle = Math.atan2(dy, dx)

          let n = norm(
            camera.position.distanceTo(target.position),
            orbitControls.minDistance,
            orbitControls.maxDistance,
          )
          n = Math.max(0.005, Math.min(1 - --n * n * n * n, 0.5))

          dx = -(event.center.x - lastMouse.x) * n
          drag.x += Math.cos(angle + PI * 0.5) * dx
          drag.z += Math.sin(angle + PI * 0.5) * dx

          dy = (event.center.y - lastMouse.y) * n
          drag.x += Math.cos(angle) * dy
          drag.z += Math.sin(angle) * dy
        }

        lastMouse.set(event.center.x, event.center.y)
        break
      }
    }
  }

  /** 每帧更新控制器状态、拖拽惯性与目标约束。 */
  exports.update = function (): boolean | void {
    if (!ready) return false

    if (cameraControls().tweening) return false

    const camera = legacyCamera()

    // curator 桌面：补间期间持续重算到目标的距离
    const dist = camera.position.distanceTo(target.position)

    if (state == cameraControls().CURATOR_IDLE) {
      let n = 1 - norm(dist, orbitControls.minDistance, orbitControls.maxDistance)
      n = Math.max(0.005, n * n * n)
      n = lerp(n, 0.25, 1)
      exports.axis.y = n
      exports.axis.z = 1
      exports.axis.normalize()
      exports.distance = dist
    }

    const len = camera.position.length()
    // sphere：始终保持在球体外侧
    if (state == cameraControls().VISUALIZER_SPHERE) {
      trackball.rotateSpeed = 0.01 + map(len, trackball.minDistance, trackball.maxDistance, 0, 1)
      trackball.zoomSpeed = 0.01 + map(len, trackball.minDistance, trackball.maxDistance, 0, 0.1)
      return trackball.update()
    }

    if (state == cameraControls().VISUALIZER_RANDOM) {
      trackball.rotateSpeed = 0.2 + map(len, trackball.minDistance, trackball.maxDistance, 0, 0.5)
      trackball.zoomSpeed = 0.1 + map(len, trackball.minDistance, trackball.maxDistance, 0, 0.9)
      return trackball.update()
    }

    if (state == cameraControls().CURATOR_IDLE) {
      // 拖拽
      target.position.add(drag)
      drag.multiplyScalar(0.9)
      if (drag.length() < 0.1 && !drag.equals(ZERO)) {
        drag.set(0, 0, 0)
        cameraControls().forceLod()
      }

      // 将目标约束到 Rasterfairy 网格
      target.position.y = -1

      if (selectedAsset == null) {
        target.position.x = Math.max(
          CuratorChapter.min.x,
          Math.min(CuratorChapter.max.x, target.position.x),
        )
        target.position.z = Math.max(
          CuratorChapter.min.y,
          Math.min(CuratorChapter.max.y, target.position.z),
        )
      }

      const p = target.position
        .clone()
        .add(exports.axis.normalize().multiplyScalar(exports.distance))
      camera.position.copy(p)
      camera.position.x += (p.x - camera.position.x) * 0.05
      camera.position.y += (p.y - camera.position.y) * 0.05
      camera.position.z += (p.z - camera.position.z) * 0.05
    }

    return orbitControls.update()
  }

  const sg = new THREE.IcosahedronGeometry(1, 1)
  function createSphere(p: THREE.Vector3, c?: number) {
    const s = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: c || 0x000000 }))
    s.position.copy(p)
    legacyScene().add(s)
    return s
  }

  /** 约束钩子（当前为空实现）。 */
  exports.constrain = function () {
  }

  /** 记录选中的素材，并在 CURATOR_IDLE 下调整距离。 */
  exports.selectAsset = function (asset: unknown) {
    selectedAsset = asset
    if (state == cameraControls().CURATOR_IDLE) {
      if (asset != null) {
        exports.distance = orbitControls.minDistance
      }
    }
  }

  return exports
})({} as DefaultControls)
