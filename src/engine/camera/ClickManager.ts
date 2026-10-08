import Hammer from 'hammerjs'
import {
  NearestFilter,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three'
import type { Asset } from '../atlas/Asset'
import type { Atlas } from '../atlas/Atlas'
import type { MetadataAsset } from '../atlas/Metadatas'
import { tsneSphere } from '../atlas/TsneSphere'
import { cameraControls as engineCameraControls } from './CameraControls'
import {
  app as engineApp,
  atlas as engineAtlas,
  camera as engineCamera,
  renderer as engineRenderer,
  scene as engineScene,
} from '../Main'

/**
 * atlas 的拾取管理器。
 * 将素材（uid 烘入像素）渲染到离屏 WebGLRenderTarget，再读回指针所在像素，
 * 从而把点击解析为具体素材。Hammer 的 tap / doubletap / pan 驱动光标与导航，
 * 元数据标签由 atlas 的 raycast 方法处理。
 */

/** `pick` 与元数据标签可能返回的对象。 */
export type PickableAsset = Asset | MetadataAsset

/**
 * 处理函数收到的事件：Hammer 事件（`type`、`center`），
 * 或 `update` 回传给 `onClick` 的 `lastMouse` 状态对象。
 */
interface ClickEvent {
  type?: string
  center: { x: number; y: number }
}

/** `lastMouse`：`onClick` 会写入初始字面量未声明的 `x` / `y`。 */
interface LastMouseState extends ClickEvent {
  type: string
  x?: number
  y?: number
}

/** 本模块使用的 cameraControls 接口。 */
interface ClickCameraControls {
  state: number
  VISUALIZER_WAVES: number
  isSelectedAsset(asset: PickableAsset): boolean
  gotoAsset(asset: PickableAsset): void
  trackball: { enabled: boolean; down: boolean; forceMouseUp(): void }
  orbitControls: { enabled: boolean; down: boolean; forceMouseUp(): void }
}

/** `app`：仅读取其可选的编辑面板。 */
interface ClickApp {
  editorPanel?: { opened: boolean; getWidth(): number }
}

/* ------------------------------------------------------------------------- *
 * 由主模块提供、需在调用时惰性读取的共享对象。
 * 本模块初始化时它们尚未就绪。
 * ------------------------------------------------------------------------- */

/** 渲染器。 */
function renderer(): WebGLRenderer {
  return engineRenderer
}

/** 场景。 */
function scene(): Scene {
  return engineScene
}

/** 相机。 */
function camera(): PerspectiveCamera {
  return engineCamera
}

/** atlas 实例。 */
function atlas(): Atlas {
  return engineAtlas
}

/** 引擎的相机控制器。 */
function cameraControls(): ClickCameraControls {
  return engineCameraControls as unknown as ClickCameraControls
}

/** 应用对象。 */
function app(): ClickApp {
  return engineApp as unknown as ClickApp
}

/** 对外暴露的 clickManager 对象。 */
export interface ClickManager {
  /** 由 `init` 赋值，运行前不存在。 */
  pickingTexture?: WebGLRenderTarget
  pixelBuffer?: Uint8Array
  init(w: number, h: number): void
  update(): void
  setSize(w: number, h: number): void
  pick(x: number, y: number): PickableAsset | null
}

export const clickManager: ClickManager = (function (exports: ClickManager) {
  let width: number
  let height: number
  let pickingTexture: WebGLRenderTarget
  let pixelBuffer: Uint8Array
  let hammer: HammerManager
  let isPanning: boolean
  let lastMouse: LastMouseState
  let mouseMoved = true
  let rollOverStartTime: number
  const rolloverInactivityTimeOut = 500
  const rolloverRefreshRate = 100

  /** 初始化拾取纹理、光标状态与 Hammer 监听。 */
  exports.init = function (w, h) {
    width = w
    height = h

    lastMouse = { center: { x: 0, y: 0 }, type: 'roll' }
    isPanning = false

    pickingTexture = new WebGLRenderTarget(w, h)
    pickingTexture.texture.minFilter = NearestFilter
    pixelBuffer = new Uint8Array(4)

    hammer = new Hammer(renderer().domElement)

    hammer.add(new Hammer.Tap({ interval: 0, taps: 1, time: 250, threshold: 10 }))
    hammer.on('tap', onClick)
    hammer.on('doubletap', onClick)

    hammer.on('panstart', onPanStart)
    hammer.on('panend', onPanEnd)

    exports.pickingTexture = pickingTexture
    exports.pixelBuffer = pixelBuffer

    renderer().domElement.addEventListener('mousemove', onMouseMove, false)
  }

  /** 每帧检测悬停：将光标切换为 pointer / default。 */
  exports.update = function () {
    requestAnimationFrame(exports.update)

    if (Date.now() > rollOverStartTime) {
      console.time('roll')

      rollOverStartTime = Date.now() + rolloverRefreshRate
      renderer().domElement.style.cursor = Boolean(onClick(lastMouse) == null) ? 'default' : 'pointer'

      mouseMoved = false
    }
  }

  exports.setSize = function (w, h) {
    width = w
    height = h
    pickingTexture.setSize(w, h)
  }

  /** 拖拽开始：切换为移动光标。 */
  function onPanStart(e: HammerInput) {
    isPanning = true
    renderer().domElement.style.cursor = 'move'
  }

  /** 拖拽结束。 */
  function onPanEnd(e: HammerInput) {
    isPanning = false
  }

  /** 更新指针位置与光标样式。 */
  function onMouseMove(e: MouseEvent) {
    lastMouse.center.x = e.clientX
    lastMouse.center.y = e.clientY

    if (isPanning) {
      rollOverStartTime = Date.now()
      renderer().domElement.style.cursor = 'move'
    } else if (atlas().testClickRaycastLabels(e)) {
      renderer().domElement.style.cursor = 'pointer'
    } else {
      renderer().domElement.style.cursor = 'default'
    }
    mouseMoved = true
  }

  /** tap / doubletap / roll 时解析命中素材并跳转。 */
  function onClick(e: ClickEvent): PickableAsset | null | undefined {
    if (cameraControls().state == cameraControls().VISUALIZER_WAVES) return

    lastMouse.x = e.center.x
    lastMouse.y = e.center.y

    if (e.type == 'press') return

    // 开始检测元数据标签

    let delta = 0
    if (app().editorPanel && app().editorPanel.opened) {
      delta = app().editorPanel.getWidth()
    }

    let asset: PickableAsset | null = exports.pick(e.center.x - delta, e.center.y)

    if (!asset) asset = atlas().clickRaycastLabels(e)

    if (asset && e.type != 'roll') {
      if (
        cameraControls().isSelectedAsset(asset) &&
        asset.position.distanceTo(camera().position) < 40
      ) {
        return
      }
      cameraControls().gotoAsset(asset)

      if (cameraControls().trackball.enabled && cameraControls().trackball.down)
        cameraControls().trackball.forceMouseUp()
      else if (cameraControls().orbitControls.enabled && cameraControls().orbitControls.down)
        cameraControls().orbitControls.forceMouseUp()
    }

    return asset
  }

  /** 在指针位置读取 picking 纹理像素并解析出对应素材。 */
  exports.pick = function (x, y) {
    if (atlas()) {
      if (tsneSphere.mesh) tsneSphere.mesh.visible = false

      atlas().meshes.forEach(function (m) {
        m.material.material.uniforms.renderUidColor.value = 1
      })

      // three r163 起 render 不再接受 renderTarget 参数，改为在调用前后绑定渲染目标，
      // 同样只渲染一遍到 pickingTexture，再切回画布。
      renderer().setRenderTarget(pickingTexture)
      renderer().render(scene(), camera())
      renderer().setRenderTarget(null)

      atlas().meshes.forEach(function (m) {
        m.material.material.uniforms.renderUidColor.value = 0
      })

      if (tsneSphere.mesh) tsneSphere.mesh.visible = true

      renderer().readRenderTargetPixels(pickingTexture, x, pickingTexture.height - y, 1, 1, pixelBuffer)

      const uid = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | pixelBuffer[2]

      let asset: Asset | null = null

      atlas().assets.forEach(function (a) {
        if (asset) return
        if (uid == a.uid) {
          asset = a
        }
      })
      return asset
    }
    return null
  }

  return exports
})({} as ClickManager)
