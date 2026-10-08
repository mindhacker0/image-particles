import * as THREE from 'three'
import { cameraControls as engineCameraControls } from '../CameraControls'
import { shared } from '../../Main'
import { legacyCamera } from '../../legacyScope'
import { norm } from '../../utils/math'
import Hammer from 'hammerjs'

/**
 * t-SNE 可视化器的相机控制器。
 * 目标点跟随指针在地形高度图上的位置（`shootTarget`），相机拖拽整个场景，
 * 滚轮系数随到地面的距离变化。
 */

/** 角度常量（本地定义，避免对引入顺序的依赖）。 */
const PI = Math.PI
const RAD = Math.PI / 180

/* ------------------------------------------------------------------------- *
 * 主模块共享状态。
 * 它们在模块初始化时尚未就绪，只能在调用时惰性读取。
 * ------------------------------------------------------------------------- */

/**
 * t-SNE 高度图公式未在本构建中定义，`getGroundLevel` 访问它会抛 ReferenceError。
 */
declare const ImageTsneFormula: { getHeightAt(x: number, y: number): number }

/**
 * `shootTarget` 射线检测用的网格；本构建未定义该对象，
 * 实际发布的是 `tsneSphere`，这里保留同名声明以免误改检测目标。
 */
declare const tsneMesh: { mesh: THREE.Object3D }

/** 由 `update` 写入的 LOD 锁定状态。 */
function setLockLOD(value: boolean): void {
  shared.lockLOD = value
}

/** t-SNE 最小滚轮系数。 */
function mouseWheelDeltaFactorTsneMin(): number {
  return shared.mouseWheelDeltaFactor_tsne_min
}

/** t-SNE 最大滚轮系数。 */
function mouseWheelDeltaFactorTsneMax(): number {
  return shared.mouseWheelDeltaFactor_tsne_max
}

/** orbit 滚轮系数，由 `update` 写入。 */
function setMouseWheelDeltaFactorOrbit(value: number): void {
  shared.mouseWheelDeltaFactorOrbit = value
}

/** 被改写的 Hammer 鼠标输入实例（`this` 的形态）。 */
interface HammerMouseInput {
  pressed: boolean | number
  button: number | boolean
  allow: boolean
  manager: unknown
  callback(manager: unknown, eventType: number, data: Record<string, unknown>): void
}

interface HammerMouseEvent {
  type: string
  button: number
  which: number
}

/**
 * 使用旧版 `mouseButtons` 键名的 three `OrbitControls` 接口。
 *
 * 注意：npm 版 `OrbitControls`（r150+）使用 `{ LEFT, MIDDLE, RIGHT }`，
 * 不再读取 `ORBIT` / `PAN`，下面的按键映射不会生效。
 */
interface LegacyOrbitControls {
  enableZoom: boolean
  enablePan: boolean
  enableRotate: boolean
  enableDamping: boolean
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
  mouseButtons: { ORBIT: number; ZOOM: number; PAN: number }
  update(): boolean
}

/** 本模块使用的 cameraControls 接口。 */
interface TsneControlsContext {
  tweening: boolean
  orbitControls: LegacyOrbitControls
  target: THREE.Object3D
  MACHINE_AUTO: number
  forceLod(): void
}

function cameraControls(): TsneControlsContext {
  return engineCameraControls as unknown as TsneControlsContext
}

/**
 * 传给 `mouseHandler` 的事件：原始滚轮事件，或带 `center` 的 Hammer 事件。
 */
type TsneControlEvent = {
  type: string
  center: { x: number; y: number }
}

/** 对外暴露的 tsneControls 对象。 */
interface TsneControls {
  bind: boolean
  shoot: boolean
  shootDistance: number
  stick: boolean
  recenter: boolean
  locked: boolean
  init(): void
  getYOffset(pos?: THREE.Vector3, offset?: unknown): number
  getGroundLevel(pos?: THREE.Vector3, offset?: unknown): number
  setState(): void
  onShift(newState: boolean): void
  mouseHandler(event: TsneControlEvent): void
  update(): boolean | void
  constrain(): void
  selectAsset(asset: unknown): void
}

export const tsneControls: TsneControls = (function (exports: TsneControls) {
  let orbitControls: LegacyOrbitControls
  let target: THREE.Object3D
  // 从未赋值，因此 state == MACHINE_AUTO 恒为 false。
  let state: number
  let ready = false
  let shiftDown: boolean
  let selectedAsset: unknown

  //////////////////////////

  const mouse = new THREE.Vector2()
  const lastMouse = new THREE.Vector2()

  const center = { x: 0, y: 0 }
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const raycaster = new THREE.Raycaster()
  // r125+ 将平面交点写入该向量，而不再返回新分配的向量。
  const planeIntersection = new THREE.Vector3()

  const position = new THREE.Vector3()
  const deltaPosition = new THREE.Vector3()
  const drag = new THREE.Vector3()
  const ZERO = new THREE.Vector3()

  //////////////////////////

  let longitude = NaN
  let latitude = NaN
  let orbitDistance = NaN
  const origin = new THREE.Vector3()
  let savedX: number
  let savedY: number
  let savedLongitude: number
  let savedLatitude: number

  exports.bind = false
  exports.shoot = true
  exports.shootDistance = 500
  exports.stick = true
  exports.recenter = true

  exports.locked = false
  //////////////////////////

  /** 初始化：缓存共享对象，并改写 Hammer 的鼠标输入以支持右键。 */
  exports.init = function () {
    orbitControls = cameraControls().orbitControls
    target = cameraControls().target

    // 扩展以支持右键

    // Hammer 未公开该映射，这里手动复制
   
    const MOUSE_INPUT_MAP: Record<string, number> = {
      mousedown: Hammer.INPUT_START,
      mousemove: Hammer.INPUT_MOVE,
      mouseup: Hammer.INPUT_END,
    }
    // 覆写
    // `@types/hammerjs` 将 MouseInput / Input 类型化为实例，
    // 而运行时 inherit 需要的是它们的构造函数。
    Hammer.inherit(
      Hammer.MouseInput as unknown as Function,
      Hammer.Input as unknown as Function,
      {
        handler: function MEhandler(this: HammerMouseInput, ev: HammerMouseEvent) {
        let eventType = MOUSE_INPUT_MAP[ev.type]

        // 改写以处理所有按键
        // 左=0，中=1，右=2
        if (eventType & Hammer.INPUT_START) {
          // Firefox 的 mousemove 会上报 button 0，这里暂存真实按键
          if (this.pressed === false) this.button = ev.button
          this.pressed = true
        }

        if (eventType & Hammer.INPUT_MOVE && ev.which === 0) {
          eventType = Hammer.INPUT_END
        }
        // 必须处于按下状态且允许鼠标事件
        if (!this.pressed || !this.allow) {
          return
        }

        if (eventType & Hammer.INPUT_END) {
          this.pressed = false
          this.button = false
        }

        this.callback(this.manager, eventType, {
          button: this.button,
          pointers: [ev],
          changedPointers: [ev],
          pointerType: 'mouse',
          srcEvent: ev,
        })
      },
    })
  }

  /** 返回目标点相对地面的高度。 */
  exports.getYOffset = function (pos?: THREE.Vector3, offset?: unknown): number {
    const p = pos || legacyCamera().position
    return Math.max(exports.getGroundLevel(p, offset), p.y)
  }

  /** 返回地形高度图在指定位置的高度。 */
  exports.getGroundLevel = function (pos?: THREE.Vector3, offset?: unknown): number {
    const p = pos || legacyCamera().position
    const groundOffset = offset == null || Boolean(offset) ? 8 : 0
    return ImageTsneFormula.getHeightAt(p.x, p.z) + groundOffset
  }

  /** 初始化状态：关闭旋转 / 平移 / 缩放并设定极角范围。 */
  exports.setState = function () {
    orbitControls.enableRotate = false
    orbitControls.enablePan = false
    orbitControls.enableZoom = false

    orbitControls.maxDistance = 35000

    orbitControls.minPolarAngle = PI * 0.5 - RAD * 85
    orbitControls.maxPolarAngle = PI * 0.5 - RAD * 5

    ready = true
  }

  /** 同步 Shift 键状态；按下时触发一次目标重定位。 */
  exports.onShift = function (newState: boolean) {
    shiftDown = newState
    orbitControls.enableZoom = true
    orbitControls.enablePan = false
    orbitControls.enableRotate = true
    if (shiftDown) {
      if (exports.shoot) shootTarget()
    }
  }

  /** 处理滚轮与拖拽，驱动目标跟随指针。 */
  exports.mouseHandler = function (event: TsneControlEvent) {
    if (state == cameraControls().MACHINE_AUTO) return
    if (cameraControls().tweening) return
    if (exports.locked) return

    switch (event.type) {
      case 'wheel':
      case 'mousewheel':
        // TODO：不依赖 orbit 的缩放，并绑定到界面按钮
        if (exports.shoot) shootTarget()

        break

      case 'press':
      case 'panstart':
      case 'touchstart':
        lastMouse.set(event.center.x, event.center.y)
        savedX = event.center.x
        savedY = event.center.y

        break

      case 'release':
      case 'tap':
      case 'panend':
        lastMouse.set(0, 0)

        break

      case 'pan': {
        const camera = legacyCamera()

        if (cameraControls().tweening) return

        if (shiftDown) {
          lastMouse.set(event.center.x, event.center.y)
          drag.set(0, 0, 0)
        }

        if (!shiftDown) {
          // 拖拽：使位移与相机距离成正比
          let n = norm(
            camera.position.y,
            exports.getGroundLevel(),
            orbitControls.maxDistance * 0.45,
          )
          n = Math.max(0.02, Math.min(1 - --n * n * n * n, 1))

          let dx = target.position.x - camera.position.x
          let dy = target.position.z - camera.position.z
          const angle = Math.atan2(dy, dx)

          dx = -(event.center.x - lastMouse.x) * n
          drag.x += Math.cos(angle + PI * 0.5) * dx
          drag.z += Math.sin(angle + PI * 0.5) * dx

          dy = (event.center.y - lastMouse.y) * n
          drag.x += Math.cos(angle) * dy
          drag.z += Math.sin(angle) * dy

          lastMouse.set(event.center.x, event.center.y)

          if (exports.shoot) shootTarget()
        }

        break
      }
    }
  }

  /** 从屏幕中心发射射线，把目标点投到地形或无限平面上。 */
  function shootTarget() {
    raycaster.setFromCamera(
      // center 是屏幕中心（NDC 0, 0），setFromCamera 只读取其中的 x / y。
      center as unknown as THREE.Vector2,
      legacyCamera() as unknown as THREE.Camera,
    )
    const meshHits = raycaster.intersectObject(tsneMesh.mesh)

    let ip = target.position

    if (meshHits.length) {
      // 命中网格

      ip = meshHits[0].point
    } else {
      // 无限平面

      const planeHit = raycaster.ray.intersectPlane(plane, planeIntersection)

      if (planeHit != null) {
        if (ip.distanceTo(legacyCamera().position) < exports.shootDistance) {
          ip = planeHit
        }
      }
    }
    target.position.copy(ip)
  }

  /** 每帧更新拖拽惯性、半径限制与滚轮系数。 */
  exports.update = function (): boolean | void {
    if (!ready) return false
    if (cameraControls().tweening) return false
    if (exports.locked) return false

    orbitControls.mouseButtons.PAN = shiftDown ? THREE.MOUSE.RIGHT : THREE.MOUSE.LEFT
    orbitControls.mouseButtons.ORBIT = shiftDown ? THREE.MOUSE.LEFT : THREE.MOUSE.RIGHT

    const camera = legacyCamera()

    // 拖拽
    target.position.add(drag)
    camera.position.add(drag)

    const cy = target.position.y
    const maxRadius = Math.sqrt(2) * 8000

    if (target.position.length() >= maxRadius) {
      target.position.normalize().multiplyScalar(maxRadius)
      target.position.y = cy
    }

    drag.multiplyScalar(0.9)
    if (!drag.equals(ZERO) && drag.length() > 0.1) {
      setLockLOD(true)
    } else {
      setLockLOD(false)
      if (!drag.equals(ZERO)) {
        cameraControls().forceLod()
      }
      drag.set(0, 0, 0)
    }

    // 超过最大距离 80° 后重新居中目标
    if (exports.recenter) {
      const d = camera.position.distanceTo(target.position)
      const n = norm(d, orbitControls.minDistance, orbitControls.maxDistance)
      if (n > 0.9) {
        target.position.x += -target.position.x * 0.1
        target.position.y += -target.position.y * 0.1
        target.position.z += -target.position.z * 0.1
      }
      orbitControls.enableDamping = n != 1

      let factor = (camera.position.y - 400) / 1500
      if (factor < 0) factor = 0
      else if (factor > 1) factor = 1
      // 按到目标的距离调整缩放系数
      setMouseWheelDeltaFactorOrbit(
        mouseWheelDeltaFactorTsneMin() +
          factor * (mouseWheelDeltaFactorTsneMax() - mouseWheelDeltaFactorTsneMin()),
      )
    }

    return orbitControls.update()
  }

  /** 约束钩子（当前为空实现）。 */
  exports.constrain = function () {
  }

  /** 记录选中的素材。 */
  exports.selectAsset = function (asset: unknown) {
    selectedAsset = asset
  }

  return exports
})({} as TsneControls)
