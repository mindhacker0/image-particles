import * as THREE from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { TrackballControls as TrackballControlsImpl } from 'three/examples/jsm/controls/TrackballControls.js'
import Hammer from 'hammerjs'
import { gsap } from 'gsap'
import {
  disableUI as mainDisableUI,
  enableUI as mainEnableUI,
  renderEngine,
  shared,
} from '../Main'
import { lod } from '../atlas/lod/lod'
import { atlasInstance, legacyCamera, legacyParams, markRenderNeeded } from '../legacyScope'
import { EventDispatcher } from '../utils/events'
import { getCurrentUrl, supportsPassive, type LegacyWheelEvent } from '../utils/functions'
import { lerp } from '../utils/math'
import { defaultControls } from './controls/DefaultControls'
import { timelineControls } from './controls/TimelineControls'
import { tsneControls } from './controls/TsneControls'

/**
 * 整个实验的相机控制器。
 * 负责 OrbitControls / TrackballControls、状态切换、鼠标/手势事件和相机导航。
 */

/** 相机控制模块的公共常量。 */
export const PI = Math.PI
export const PI2 = Math.PI * 2
export const RAD = Math.PI / 180
export const DEG = 180 / Math.PI

/** 判断三维向量是否包含 NaN。 */
export function hasNan(v: { x: number; y: number; z: number }): boolean {
  return isNaN(v.x) || isNaN(v.y) || isNaN(v.z)
}

/* ------------------------------------------------------------------------- *
 * 主模块共享状态。
 * 它们在模块初始化时尚未就绪，只能在调用时惰性读取。
 * ------------------------------------------------------------------------- */

/** 渲染器实例。 */
function renderer(): { domElement: ControlDomElement } {
  return renderEngine.renderer as unknown as { domElement: ControlDomElement }
}

/** 检测浏览器支持的滚轮事件类型（wheel / mousewheel）。 */
function windowWheelHandlers(): { onwheel?: unknown; onmousewheel?: unknown } {
  return window as unknown as { onwheel?: unknown; onmousewheel?: unknown }
}

/** 拖拽或滚轮期间锁定 LOD 更新。 */
function lockLOD(): boolean {
  return shared.lockLOD
}

/** 设置 LOD 锁定状态。 */
function setLockLOD(value: boolean): void {
  shared.lockLOD = value
}

/** 获取相机控制器是否禁用。 */
function disableCameraControls(): boolean {
  return shared.disableCameraControls
}

/** 介绍动画显示期间的状态。 */
function displayIntroItem(): boolean {
  return shared.displayIntroItem
}

/** 调用主模块的禁用 UI。 */
function disableUI(): void {
  mainDisableUI()
}

/** 调用主模块的启用 UI。 */
function enableUI(): void {
  mainEnableUI()
}

/** 设置滚轮灵敏度。 */
function setMouseWheelDeltaFactor(value: number): void {
  shared.mouseWheelDeltaFactor = value
}

/** 默认滚轮系数。 */
function mouseWheelDeltaFactorDefault(): number {
  return shared.mouseWheelDeltaFactor_default
}

/** freefall 场景的滚轮系数。 */
function mouseWheelDeltaFactorFreefall(): number {
  return shared.mouseWheelDeltaFactor_freefall
}

/**
 * `removeListeners` 中 `hammer.off('doubletap', onDoubleTap)` 引用的处理函数未定义，
 * 该调用位于 try/catch 内，其 ReferenceError 会被吞掉；此环境声明保证行为不变。
 */
declare const onDoubleTap: (event: CameraControlEvent) => void

/* ------------------------------------------------------------------------- *
 * 本模块使用的内部类型定义。
 * ------------------------------------------------------------------------- */

/**
 * `renderer.domElement` 的最小接口：需要承载 Hammer / 滚轮 / 鼠标事件，
 * 这些事件在标准 DOM 类型中无法通过重载检查。
 */
interface ControlDomElement {
  addEventListener(
    type: string,
    listener: (event: CameraControlEvent) => void,
    options?: unknown,
  ): void
  removeEventListener(
    type: string,
    listener: (event: CameraControlEvent) => void,
    options?: unknown,
  ): void
}

/**
 * 传给控制器与本模块处理函数的事件：原始滚轮事件，或带 `center` 的 Hammer 事件。
 */
type CameraControlEvent = LegacyWheelEvent & {
  type: string
  preventDefault(): void
  center: { x: number; y: number }
}

/** 本模块使用的 Hammer 接口（@types/hammerjs 的类型更窄）。 */
interface HammerInstance {
  on(event: string, handler: (event: CameraControlEvent) => void, useCapture: boolean): void
  off(event: string, handler: (event: CameraControlEvent) => void, useCapture: boolean): void
  add(recognizer: unknown): void
}

/**
 * three 的 `OrbitControls` 接口。
 *
 * 注意：npm 版 `OrbitControls`（r150+）的 `mouseButtons` 使用
 * `{ LEFT, MIDDLE, RIGHT }`，不再读取 `ORBIT` / `ZOOM` / `PAN`；
 * `enableKeys` 也已在 r147 移除，下面的赋值不会生效。
 */
interface OrbitControls {
  enabled: boolean
  target: THREE.Vector3
  enableDamping: boolean
  dampingFactor: number
  /** 该属性自 three r147 起已移除。 */
  enableKeys: boolean
  enableZoom: boolean
  rotateSpeed: number
  panSpeed: number
  zoomSpeed: number
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
  minAzimuthAngle: number
  maxAzimuthAngle: number
  mouseButtons: { ORBIT: number; ZOOM: number; PAN: number }
  update(): boolean
}

/** three 的 `TrackballControls` 接口。 */
interface TrackballControls {
  enabled: boolean
  target: THREE.Vector3
  rotateSpeed: number
  panSpeed: number
  zoomSpeed: number
  minDistance: number
  maxDistance: number
  update(): boolean
}

/**
 * 相机对象。
 *
 * `legacyCamera()` 只描述 atlas 用到的成员，这里还需要 `up`、`lookAt` 与 `copy`，
 * 因此将其还原为完整的 three 相机。
 */
function camera(): THREE.Camera {
  return legacyCamera() as unknown as THREE.Camera
}

/** 本模块读取的 atlas 单个素材。 */
interface CameraControlsAsset {
  position: THREE.Vector3
  sizeNorm: { w: number; h: number }
  coords: { w: number; h: number }
}

/** `atlas.meshes` 中的单个网格，含 `setState` 动画使用的波浪 uniform。 */
interface CameraControlsMesh {
  material: {
    material: {
      uniforms: Record<string, { value: number }>
    }
  }
}

/**
 * 本模块使用的 atlas 实例；`atlasInstance()` 只覆盖共享成员。
 */
interface CameraControlsAtlas {
  meshes: CameraControlsMesh[]
  setFogDistance(value: number, duration?: number): void
  getAsset(id: string): CameraControlsAsset | null
  getOldestAsset(): CameraControlsAsset | null
}

function atlasApi(): CameraControlsAtlas {
  return atlasInstance() as unknown as CameraControlsAtlas
}

/** `boundingBoxes` 中的一项（由 timeline 应用构建）。 */
interface TimelineBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 当前驱动相机的控制器（`defaultControls`、`timelineControls` 或 `tsneControls`）。
 * 只描述 `cameraControls` 调用到的成员，以便在 `setState` 中互换。
 */
interface CameraController {
  setState(newState: number): void
  onShift(newState: boolean): void
  /** `onWheel` 会传入第二个参数 tweening，但三个控制器都会忽略它。 */
  mouseHandler(event: CameraControlEvent, tweening?: boolean): void
  update(tweening?: boolean): boolean | void
  constrain(): void
  selectAsset(asset: unknown): void
  onSelectedAssetReached?(): void
}

/** 对外暴露的 cameraControls 对象。 */
interface CameraControls {
  time: number

  // 时间线包围盒相关字段
  timelineHeight: number
  timelineWidth: number
  /** 由 freefall 应用设置（设置前为 null）。 */
  timelineScroll: unknown
  boundingBoxes: TimelineBoundingBox[] | null
  /** 占位字段，从未被写入。 */
  box: unknown

  maxSelectedAssetDistance: number

  IDLE: number
  VISUALIZER_RANDOM: number
  VISUALIZER_SPHERE: number
  VISUALIZER_WAVES: number
  TIMELINE_FLAT: number
  TIMELINE_3D: number
  CURATOR_IDLE: number
  CURATOR_SELECTION: number
  CURATOR_TIMELINE: number
  CURATOR_COLOR: number
  MACHINE_TSNE: number
  MACHINE_AUTO: number
  tweening: boolean
  /** 仅由 `setState` 赋值。 */
  state: number

  orbitControls: OrbitControls
  trackball: TrackballControls
  target: THREE.Object3D

  /** 从未被赋值。 */
  onControlsChange: ((...args: unknown[]) => void) | null
  /** 从未被赋值。 */
  onComplete: ((forceUpdate?: boolean) => void) | null

  init(): void
  onShift(newState: boolean): void
  setState(newState: number): void
  dispose(): void
  removeListeners(): void
  addListeners(): void
  update(forceUpdate?: boolean): void
  info(): string
  toUrl(): void
  initFromUrl(url: string, duration?: number): void
  getPositionsFromURL(url: string): THREE.Vector3[] | null
  forceLod(): void
  cameraGoto(
    pos?: THREE.Vector3 | null,
    duration?: number,
    cb?: (() => void) | null,
    onUpdate?: (() => void) | null,
    ease?: unknown,
  ): void
  targetGoto(
    pos?: THREE.Vector3 | null,
    duration?: number,
    cb?: (() => void) | null,
    onUpdate?: (() => void) | null,
    ease?: unknown,
  ): void
  isSelectedAsset(asset: unknown): boolean
  gotoAsset(
    asset: CameraControlsAsset | string | null,
    duration?: number,
    cb?: (() => void) | null,
    ease?: unknown,
    delay?: number,
  ): void
  lockUI(): void
  unlockUI(): void
}

export const cameraControls: CameraControls = (function (exports: CameraControls) {
  const urlSep = ','
  let events: EventDispatcher
  let target: THREE.Object3D

  const sphere0 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5, 1),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  )
  const sphere1 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5, 1),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
  )
  const sphere2 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5, 1),
    new THREE.MeshBasicMaterial({ color: 0x0000ff }),
  )

  const ZERO = new THREE.Vector3()
  const lastCamera = new THREE.Vector3()
  const lastTarget = new THREE.Vector3()
  const cameraOrigin = new THREE.Vector3()
  const targetOrigin = new THREE.Vector3()

  exports.time = 0

  // 时间线包围盒相关字段
  exports.time = 0 // 此处重复赋值为 0，无副作用
  exports.timelineHeight = 0
  exports.timelineWidth = 0
  exports.timelineScroll = null
  exports.boundingBoxes = null
  exports.box = null

  exports.maxSelectedAssetDistance = 250

  let state: number
  let i = 0
  exports.IDLE = -1
  exports.VISUALIZER_RANDOM = i++
  exports.VISUALIZER_SPHERE = i++
  exports.VISUALIZER_WAVES = i++

  exports.TIMELINE_FLAT = i++
  exports.TIMELINE_3D = i++

  exports.CURATOR_IDLE = i++
  exports.CURATOR_SELECTION = i++
  exports.CURATOR_TIMELINE = i++
  exports.CURATOR_COLOR = i++

  exports.MACHINE_TSNE = i++
  exports.MACHINE_AUTO = i++
  exports.tweening = false

  let controls: CameraController
  let orbitControls: OrbitControls

  let trackball: TrackballControls

  // 用超时防止 macOS 平滑滚轮触发连续调用
  let onCompleteTimeout: ReturnType<typeof setTimeout>
  let locked: boolean
  let isUpdating = false
  let needsRefresh = false
  let shiftDown = false
  let needsUpdate = false

  let selectedAsset: CameraControlsAsset | null
  let normalCameraDistance = 1

  let hammerInstance: HammerInstance | null = null

  /** 初始化 OrbitControls / TrackballControls、控制器与手势监听。 */
  exports.init = function () {
    const cam = camera()
    cam.position.x = 0
    cam.position.y = 1000000
    cam.position.z = 1000000

    orbitControls = new OrbitControlsImpl(
      cam,
      renderer().domElement as unknown as HTMLElement,
    ) as unknown as OrbitControls
    orbitControls.enableDamping = true
    orbitControls.dampingFactor = 0.05
    orbitControls.enableKeys = false
    exports.orbitControls = orbitControls

    trackball = new TrackballControlsImpl(
      cam,
      renderer().domElement as unknown as HTMLElement,
    ) as unknown as TrackballControls
    trackball.enabled = false
    exports.trackball = trackball

    target = new THREE.Object3D()
    exports.target = target

    defaultControls.init()
    timelineControls.init()
    tsneControls.init()
    controls = defaultControls

    // 释放已选中素材的最大距离
    exports.maxSelectedAssetDistance = lod.maxRange

    // 事件分发器
    events = new EventDispatcher()
    hammerInstance = new Hammer(
      renderer().domElement as unknown as HTMLElement,
    ) as unknown as HammerInstance
    hammerInstance.add(new Hammer.Pan({ direction: Hammer.DIRECTION_ALL, threshold: 0 }))
    hammerInstance.add(new Hammer.Tap({ interval: 0, time: 500, threshold: 5 }))
    exports.addListeners()
  }

  /** 同步 Shift 键状态到当前控制器。 */
  exports.onShift = function (newState: boolean) {
    shiftDown = newState
    controls.onShift(newState)
  }

  function resetOrbitControls() {
    // 重置 OrbitControls
    orbitControls.rotateSpeed = 0.1
    orbitControls.panSpeed = 0.05
    orbitControls.zoomSpeed = 0.5
    orbitControls.minDistance = 40
    orbitControls.maxDistance = 30000
    orbitControls.minPolarAngle = 0
    orbitControls.maxPolarAngle = PI
    orbitControls.minAzimuthAngle = -Infinity
    orbitControls.maxAzimuthAngle = Infinity
    orbitControls.enableZoom = true
  }

  function resetTrackball() {
    trackball.enabled = false
    trackball.rotateSpeed = 1
    trackball.panSpeed = 0.05
    trackball.zoomSpeed = 0.5
    trackball.minDistance = 40
    trackball.maxDistance = 30000
  }

  /** 切换到目标状态：重置控制器、选择对应实现并播放过渡。 */
  exports.setState = function (newState: number) {
    setMouseWheelDeltaFactor(
      newState == exports.VISUALIZER_RANDOM
        ? mouseWheelDeltaFactorFreefall()
        : mouseWheelDeltaFactorDefault(),
    )
    // t-SNE 场景的滚轮系数见 tsneControls.update

    // 清空状态
    exports.tweening = false
    selectedAsset = null
    controls.selectAsset(null)

    gsap.killTweensOf(orbitControls)
    atlasApi().setFogDistance(50000)

    // 重置控制器
    resetOrbitControls()

    // 重置 TrackballControls
    resetTrackball()

    // 设置新状态
    exports.state = state = newState

    // 按分布类型选择对应的控制器
    switch (state) {
      default:
      case exports.VISUALIZER_RANDOM:
      case exports.VISUALIZER_SPHERE:
      case exports.VISUALIZER_WAVES:
      case exports.IDLE:
      case exports.CURATOR_IDLE:
        controls = defaultControls

        break

      case exports.CURATOR_SELECTION:
      case exports.CURATOR_TIMELINE:
      case exports.CURATOR_COLOR:
      case exports.TIMELINE_FLAT:
      case exports.TIMELINE_3D:
        controls = timelineControls

        break

      case exports.MACHINE_AUTO:
      case exports.MACHINE_TSNE:
        controls = tsneControls

        break
    }

    camera().up.set(0, 1, 0)

    // 初始化当前控制器
    controls.setState(state)

    // 移除波浪动画
    for (const mesh of atlasApi().meshes) {
      gsap.to(mesh.material.material.uniforms.wavesAmp, {
        duration: 2,
        value: 0,
        onUpdate: function () {
          markRenderNeeded()
        },
      })
    }

    if (state != exports.MACHINE_TSNE && state != exports.MACHINE_AUTO) {
      exports.targetGoto(ZERO, 1)
    }

    // 同步 shift 状态
    exports.onShift(false)
  }

  exports.dispose = function () {
    exports.onControlsChange = null
    exports.onComplete = null
    exports.removeListeners()
  }

  /** 解绑手势、滚轮与鼠标离开监听。 */
  exports.removeListeners = function () {
    const dom = renderer().domElement
    try {
      hammerInstance.off('panstart', onDown, false)
      hammerInstance.off('release', onUp, false)
      hammerInstance.off('tap', onUp, false)
      // onDoubleTap 未定义，这里会抛错并被下方 catch 吞掉，
      // 因此其后的 pan / panend 处理器永远不会被解绑。
      hammerInstance.off('doubletap', onDoubleTap, false)
      hammerInstance.off('pan', onMove, false)
      hammerInstance.off('panend', onUp, false)
    } catch (e) {
      // 忽略未定义处理器导致的异常
    }

    if (windowWheelHandlers().onwheel !== undefined) {
      dom.removeEventListener('wheel', onDown, false)
    } else if (windowWheelHandlers().onmousewheel !== undefined) {
      dom.removeEventListener('mousewheel', onDown, false)
    }
    dom.removeEventListener('mouseleave', onUp, false)
  }

  /** 绑定手势、滚轮与鼠标离开监听。 */
  exports.addListeners = function () {
    exports.removeListeners()

    const dom = renderer().domElement
    hammerInstance.on('press', onDown, false)
    hammerInstance.on('panstart', onDown, false)
    hammerInstance.on('touchstart', onDown, false)
    hammerInstance.on('release', onUp, false)
    hammerInstance.on('panend', onUp, false)
    hammerInstance.on('tap', onUp, false)
    hammerInstance.on('doubletap', onUp, false)
    hammerInstance.on('pan', onMove, false)

    if (windowWheelHandlers().onwheel !== undefined) {
      dom.addEventListener('wheel', onWheel, supportsPassive ? { passive: true } : false)
    } else if (windowWheelHandlers().onmousewheel !== undefined) {
      dom.addEventListener('mousewheel', onWheel, supportsPassive ? { passive: true } : false)
    }
    dom.addEventListener('mouseleave', onUp, false)
  }

  /** 按下：记录 LOD 锁定状态并交由当前控制器处理。 */
  function onDown(e: CameraControlEvent) {
    if (exports.tweening) return
    locked = lockLOD()
    needsUpdate = true
    controls.mouseHandler(e)
  }

  /** 滚轮：处理缩放并立即触发一次更新。 */
  function onWheel(e: CameraControlEvent) {
    e.preventDefault()

    if (exports.tweening) return
    controls.mouseHandler(e, exports.tweening)
    setLockLOD(true)
    needsUpdate = true
    needsRefresh = true
    exports.update()
    needsUpdate = false

    if (state == exports.CURATOR_IDLE) {
      exports.update(true)
    }
  }

  /** 拖拽移动：交由当前控制器处理并锁定 LOD。 */
  function onMove(e: CameraControlEvent) {
    if (exports.tweening) return
    setLockLOD(true)
    needsUpdate = true
    controls.mouseHandler(e)
  }

  /** 松开：恢复按下前的 LOD 锁定状态。 */
  function onUp(e: CameraControlEvent) {
    if (exports.tweening) return
    needsUpdate = false
    controls.mouseHandler(e)
    setLockLOD(locked)
  }

  const ready = true

  /** 每帧更新控制器、相机位置与 LOD 状态。 */
  function update(forceUpdate?: boolean) {
    const cam = camera()

    // 记录当前位置，用于计算最小位移
    // 并在必要时触发 LOD 刷新
    lastCamera.copy(cam.position)
    lastTarget.copy(target.position)

    // 同步 controls 的目标点
    orbitControls.target = target.position
    trackball.target = target.position
    cam.lookAt(target.position)

    // 调用当前控制器的更新（可能不返回值，这里按真值判断）
    isUpdating = false
    if (!exports.tweening && !disableCameraControls())
      isUpdating = Boolean(controls.update(exports.tweening))

    // 兜底：位置出现 NaN 时用上一帧的备份恢复
    if (hasNan(cam.position)) cam.position.copy(lastCamera)
    if (hasNan(target.position)) target.position.copy(lastTarget)

    // 判断是否需要渲染或刷新 LOD
    if (exports.tweening || needsUpdate || isUpdating || Boolean(forceUpdate)) {
      markRenderNeeded()

      if (
        needsRefresh &&
        exports.onComplete &&
        lastCamera.distanceTo(cam.position) < 0.1 &&
        lastTarget.distanceTo(target.position) < 0.1
      ) {
        clearTimeout(onCompleteTimeout)
        onCompleteTimeout = setTimeout(exports.onComplete, 250, true)
        needsRefresh = false
      } else {
        events.dispatch('update')
        setLockLOD(true)
        needsRefresh = true
      }
    }

    // 距离足够远时释放已选中的素材
    if (!exports.tweening && selectedAsset) {
      if (
        (state == exports.MACHINE_TSNE || state == exports.MACHINE_AUTO) &&
        cam.position.distanceTo(selectedAsset.position) > exports.maxSelectedAssetDistance
      ) {
        selectedAsset = null
        controls.selectAsset(null)
      }
    }
  }

  exports.update = update

  exports.info = function () {
    return (
      (exports.tweening ? 'tween ' : ' ---- ') +
      (needsUpdate ? 'needsupdate ' : ' ---- ') +
      (isUpdating ? 'controls' : ' ---- ')
    )
  }

  function nearEquals(v: THREE.Vector3, threshold: number) {
    return Math.abs(v.x) < threshold && Math.abs(v.y) < threshold && Math.abs(v.z) < threshold
  }

  /** 将相机与目标位置写入 URL hash。 */
  function toUrl() {
    if (legacyParams().isBigWallVersion) return

    const cam = camera()
    if (hasNan(cam.position) || hasNan(target.position)) return

    // freefall 引导页不生成深链接
    if (legacyParams().directChapter == 'freefall') {
      const href = getCurrentUrl()
      const bits = href.split('/')
      if (bits[bits.length - 1] == '') return
    }

    const precision = 2

    let url = ''
    if (!nearEquals(cam.position, 0.1)) {
      url += cam.position.x.toFixed(precision) + urlSep
      url += cam.position.y.toFixed(precision) + urlSep
      url += cam.position.z.toFixed(precision) + urlSep
    }

    if (!nearEquals(target.position, 0.1)) {
      url += target.position.x.toFixed(precision) + urlSep
      url += target.position.y.toFixed(precision) + urlSep
      url += target.position.z.toFixed(precision)
    } else {
      url = url.substr(0, url.length - 1) // 去掉末尾多余的逗号
    }
    window.location.hash = url
  }
  exports.toUrl = toUrl

  /** 从 URL 片段恢复相机 / 目标位置。 */
  exports.initFromUrl = function (url: string, duration?: number) {
    const camTarget = exports.getPositionsFromURL(url)
    if (camTarget == null) {
      const asset = atlasApi().getAsset(url)
      if (asset) exports.gotoAsset(asset, 2, null, null, 0.5)

      return
    }

    // 注意：`duration == null || 0` 的结果只会是 true 或 0，
    // 传入的时长会被丢弃（类型转换仅为通过检查）。
    duration = (duration == null || 0) as unknown as number

    const onComplete = function () {
      exports.forceLod()
    }

    if (camTarget.length == 1) {
      exports.cameraGoto(camTarget[0], duration, onComplete)
    }

    if (camTarget.length == 2) {
      exports.cameraGoto(camTarget[0], duration, onComplete)
      exports.targetGoto(camTarget[1], duration)
    }

    setTimeout(exports.forceLod, (duration + 1) * 1000)
  }

  /** 解析 URL 片段中的相机 / 目标坐标。 */
  exports.getPositionsFromURL = function (url: string): THREE.Vector3[] | null {
    // 安全校验：URL 参数只能包含数字、小数点和逗号
    let out: THREE.Vector3[] | null = null

    const data = url.split(urlSep)
    let valid = true
    data.forEach(function (s) {
      if (s.replace(/[^0-9.,-]/gi, '').length != s.length) valid = false
    })
    if (!valid) return out

    if (data.length > 2) {
      out = [
        new THREE.Vector3(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])),
        new THREE.Vector3(0, 0, 0),
      ]
    }

    if (data.length > 5) {
      out = [
        new THREE.Vector3(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])),
        new THREE.Vector3(parseFloat(data[3]), parseFloat(data[4]), parseFloat(data[5])),
      ]
    }

    return out
  }

  exports.forceLod = function () {
    lod.setFromCamera()
  }

  /** 相机位置补间到指定坐标。 */
  exports.cameraGoto = function (
    pos?: THREE.Vector3 | null,
    duration?: number,
    cb?: (() => void) | null,
    onUpdate?: (() => void) | null,
    ease?: unknown,
  ) {
    exports.lockUI()
    pos = pos || ZERO
    exports.tweening = true
    const cam = camera()
    gsap.killTweensOf(cam.position)
    gsap.to(cam.position, {
      duration: isNaN(duration as number) ? 1 : (duration as number),
      x: pos.x,
      y: pos.y,
      z: pos.z,
      overwrite: true,
      ease: (ease as string) || 'expo.out',
      onUpdate: function () {
        if (onUpdate) onUpdate()
        controls.constrain()
      },
      onComplete: function () {
        exports.tweening = false
        if (cb) cb()
        exports.unlockUI()
      },
    })
  }

  /** 目标点补间到指定坐标。 */
  exports.targetGoto = function (
    pos?: THREE.Vector3 | null,
    duration?: number,
    cb?: (() => void) | null,
    onUpdate?: (() => void) | null,
    ease?: unknown,
  ) {
    exports.lockUI()
    pos = pos || ZERO
    exports.tweening = true
    gsap.killTweensOf(target.position)
    gsap.to(target.position, {
      duration: isNaN(duration as number) ? 1 : (duration as number),
      x: pos.x,
      y: pos.y,
      z: pos.z,
      overwrite: true,
      ease: (ease as string) || 'expo.out',
      onUpdate: function () {
        if (onUpdate) onUpdate()
        controls.constrain()
      },
      onComplete: function () {
        exports.tweening = false
        if (cb) cb()
        exports.unlockUI()
      },
    })
  }

  /** 判断素材是否与当前选中项一致。 */
  exports.isSelectedAsset = function (asset: unknown) {
    return asset == selectedAsset
  }

  function checkTarPosDistance(
    asset: CameraControlsAsset,
    pos: THREE.Vector3,
    tar: THREE.Vector3,
  ) {
    const cam = camera()

    const c = cam.position.clone()
    const t = target.position.clone()

    let d = pos.distanceTo(tar)
    const tl = new THREE.Vector3(asset.sizeNorm.w / 2, asset.sizeNorm.h / 2, 0)

    console.log('TL', tl.x, tl.y)
    console.log('CW', asset.coords.w / 2, asset.coords.h / 2)

    console.log('D', d)
    cam.position.set(0, 0, 0)
    cam.lookAt(ZERO)

    let proj = tl.unproject(cam)
    console.log(proj.x, proj.y)

    let iterationMax = 100
    const bound = 1
    while (proj.x < -bound || proj.y < -bound || proj.x > bound || proj.y > bound) {
      cam.position.z = d
      proj = tl.project(cam)

      console.log(iterationMax, 'too close D:', d, 'Proj: ', proj.x, proj.y)
      d++

      if (iterationMax-- < 0) break
    }

    const delta = pos.clone().sub(tar).normalize().multiplyScalar(d)
    pos = tar.clone().add(delta)

    cam.position.copy(c)
    target.position.copy(t)
    return pos
  }

  /** 将相机与目标平滑移动到指定素材。 */
  exports.gotoAsset = function (
    asset: CameraControlsAsset | string | null,
    duration?: number,
    cb?: (() => void) | null,
    ease?: unknown,
    delay?: number,
  ) {
    if (asset == null) {
      selectedAsset = null
      controls.selectAsset(asset)
      return
    }

    if (typeof asset === 'string') {
      // 注意：未识别的 id 会解析为 null，后续读取 asset.position 会报错。
      asset = atlasApi().getAsset(asset)
    }

    if (displayIntroItem()) return

    exports.lockUI()
    selectedAsset = asset
    controls.selectAsset(asset)

    let pos: THREE.Vector3, tar: THREE.Vector3
    const cam = camera()
    const camDist = orbitControls.minDistance
    const delta = cam.position.clone().sub(asset.position).normalize().multiplyScalar(camDist)
    const upVec = new THREE.Vector3(0, -1, 0)

    pos = asset.position.clone().add(delta).add(upVec)
    tar = asset.position.clone().add(upVec)

    if (state == exports.CURATOR_IDLE) {
      pos.x = tar.x
    }

    // 避免查看 3D 时间线时出现透视扭转
    if (
      state == exports.TIMELINE_3D ||
      state == exports.TIMELINE_FLAT ||
      state == exports.CURATOR_SELECTION ||
      state == exports.CURATOR_COLOR ||
      state == exports.CURATOR_TIMELINE
    ) {
      pos = tar.clone().add(timelineControls.axis.normalize().multiplyScalar(orbitControls.minDistance))
    }

    // RANDOM 模式下将视线轴锁定朝向中心
    if (state == exports.VISUALIZER_RANDOM) {
      tar = ZERO
      pos = asset.position
        .clone()
        .normalize()
        .multiplyScalar(asset.position.length() + orbitControls.minDistance)
      selectedAsset = null
      controls.selectAsset(null)

      // Berekhat Ram 的特殊处理
      if (asset == atlasApi().getOldestAsset()) {
        pos = cam.position.clone().normalize().multiplyScalar(orbitControls.minDistance)
      }
    }

    if (state == exports.VISUALIZER_SPHERE) {
      tar = ZERO
      pos = asset.position.clone().normalize().multiplyScalar(trackball.minDistance)
    }

    if (state == exports.MACHINE_TSNE || state == exports.MACHINE_AUTO) {
      tar.y = tsneControls.getYOffset(tar, false)
      pos.y = tsneControls.getYOffset(pos)
    }

    cameraOrigin.copy(cam.position)
    targetOrigin.copy(target.position)

    exports.tweening = true
    exports.time = 0

    if (typeof delay == 'undefined') delay = 0

    gsap.to(exports, {
      duration: isNaN(duration as number) ? 1.5 : (duration as number),
      time: 1,
      ease: (ease as string) || 'cubic.inOut',
      delay: delay,
      onUpdate: function () {
        cam.position.x = lerp(exports.time, cameraOrigin.x, pos.x)
        cam.position.y = lerp(exports.time, cameraOrigin.y, pos.y)
        cam.position.z = lerp(exports.time, cameraOrigin.z, pos.z)

        target.position.x = lerp(exports.time, targetOrigin.x, tar.x)
        target.position.y = lerp(exports.time, targetOrigin.y, tar.y)
        target.position.z = lerp(exports.time, targetOrigin.z, tar.z)

        controls.constrain()
        orbitControls.update()
        cam.lookAt(target.position)
      },
      onComplete: function () {
        exports.unlockUI()

        exports.tweening = false
        exports.forceLod()

        if (controls.onSelectedAssetReached) {
          controls.onSelectedAssetReached()
        }
        if (cb) cb()
      },
    })
  }

  exports.lockUI = function () {
    disableUI()
  }
  exports.unlockUI = function () {
    enableUI()
  }

  return exports
})({} as CameraControls)

/** `cc` 是同一对象的别名。 */
export const cc = cameraControls
