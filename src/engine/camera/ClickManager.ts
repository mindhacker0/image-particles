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

/**
 * Ported from `js/camera/clickManager.js`.
 *
 * Picking manager of the atlas: it renders the assets once into an offscreen
 * `WebGLRenderTarget` with their uid baked into the pixels (`pick`) and reads the
 * pixel under the pointer back, so a click can be resolved to an asset. Hammer
 * (tap / double tap) and the pan recognizers drive the cursor and the navigation,
 * `atlas.testClickRaycastLabels` / `atlas.clickRaycastLabels` handle the metadata
 * labels.
 *
 * Port notes:
 * - the IIFE shape of the original is kept, so `clickManager` stays a single
 *   object with the same members (`init`, `update`, `setSize`, `pick`,
 *   `pickingTexture`, `pixelBuffer`); it is published as the `clickManager`
 *   global by `src/engine/Main.ts`
 * - `Hammer` is imported from the npm package (`installLegacyGlobals` only
 *   publishes it on `window`, and the classic `js/camera/clickManager.js` reads
 *   it there); the imported `HammerStatic` / `HammerManager` / `HammerInput`
 *   types come from `@types/hammerjs`
 * - `three` and `tsneSphere` come from the ported modules; the
 *   globals of `src/engine/Main.ts` (`renderer`, `scene`, `camera`, `atlas`,
 *   `app`) and of `js/camera/cameraControls.js` (`cameraControls`) are read at
 *   call time through the typed getters below
 * - `renderer.render(scene, camera, pickingTexture)` became
 *   `setRenderTarget(pickingTexture)` + `render(scene, camera)` +
 *   `setRenderTarget(null)`: three r163 removed the render target argument of
 *   `render` (it is now ignored), so the legacy call would have drawn the picking
 *   pass on screen instead of into the picking texture
 * - `width`, `height` and `mouseMoved` are written but never read in the original
 *   as well (left over state): kept 1:1
 * - `rollOverStartTime` is never initialised in the original either, so
 *   `Date.now() > undefined` is false and the rollover branch of `update` stays
 *   dead until `onMouseMove` sets it while panning. It is kept 1:1 (and nothing
 *   calls `update` in this snapshot); the `console.time("roll")` without its
 *   `timeEnd` is a leftover debug call that is kept as well
 */

/** What `pick` / the metadata labels can return. */
export type PickableAsset = Asset | MetadataAsset

/**
 * The event shape the handlers receive: a Hammer event (`type`, `center`) or the
 * `lastMouse` state object `update` feeds back into `onClick`.
 */
interface ClickEvent {
  type?: string
  center: { x: number; y: number }
}

/** `lastMouse`: `onClick` writes `x` / `y`, which the initial literal does not declare. */
interface LastMouseState extends ClickEvent {
  type: string
  x?: number
  y?: number
}

/** `cameraControls` (`js/camera/cameraControls.js`) as this module uses it. */
interface ClickCameraControls {
  state: number
  VISUALIZER_WAVES: number
  isSelectedAsset(asset: PickableAsset): boolean
  gotoAsset(asset: PickableAsset): void
  trackball: { enabled: boolean; down: boolean; forceMouseUp(): void }
  orbitControls: { enabled: boolean; down: boolean; forceMouseUp(): void }
}

/** `app` (`js/apps/app_freefall.js`): only its optional editor panel is read. */
interface ClickApp {
  editorPanel?: { opened: boolean; getWidth(): number }
}

/* ------------------------------------------------------------------------- *
 * Globals written by `src/engine/Main.ts` (`js/main.js`) and by the
 * not-yet-ported classic scripts. They are read at call time: they do not exist
 * yet while this module is evaluated.
 * ------------------------------------------------------------------------- */

/** `renderer` — created by `initTHREE` in `src/engine/Main.ts`. */
function renderer(): WebGLRenderer {
  return (window as unknown as { renderer: WebGLRenderer }).renderer
}

/** `scene` — created by `initTHREE` in `src/engine/Main.ts`. */
function scene(): Scene {
  return (window as unknown as { scene: Scene }).scene
}

/** `camera` — created by `initTHREE` in `src/engine/Main.ts`. */
function camera(): PerspectiveCamera {
  return (window as unknown as { camera: PerspectiveCamera }).camera
}

/** `atlas` — the atlas instance created by `appStart` in `src/engine/Main.ts`. */
function atlas(): Atlas {
  return (window as unknown as { atlas: Atlas }).atlas
}

/** `cameraControls` — `js/camera/cameraControls.js`, not ported yet. */
function cameraControls(): ClickCameraControls {
  return (window as unknown as { cameraControls: ClickCameraControls }).cameraControls
}

/** `app` — `js/apps/app_freefall.js`, not ported yet. */
function app(): ClickApp {
  return (window as unknown as { app: ClickApp }).app
}

/** The public surface of the module, i.e. the legacy `clickManager` object. */
export interface ClickManager {
  /** assigned by `init`: the member does not exist before it runs */
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

  exports.init = function (w, h) {
    width = w
    height = h

    lastMouse = { center: { x: 0, y: 0 }, type: 'roll' }
    isPanning = false

    pickingTexture = new WebGLRenderTarget(w, h)
    pickingTexture.texture.minFilter = NearestFilter
    pixelBuffer = new Uint8Array(4)

    hammer = new Hammer(renderer().domElement)

    // hammer.on( "press", onClick );
    hammer.add(new Hammer.Tap({ interval: 0, taps: 1, time: 250, threshold: 10 }))
    hammer.on('tap', onClick)
    hammer.on('doubletap', onClick)

    hammer.on('panstart', onPanStart)
    hammer.on('panend', onPanEnd)

    exports.pickingTexture = pickingTexture
    exports.pixelBuffer = pixelBuffer

    renderer().domElement.addEventListener('mousemove', onMouseMove, false)

    // exports.update();
  }

  exports.update = function () {
    requestAnimationFrame(exports.update)

    if (Date.now() > rollOverStartTime) {
      console.time('roll')
      // console.log( lastMouse.center.x, lastMouse.center.y , Date.now(), rollOverStartTime + rolloverInactivityTimeOut , mouseMoved, ":", Date.now()> rollOverStartTime + rolloverInactivityTimeOut );

      rollOverStartTime = Date.now() + rolloverRefreshRate
      renderer().domElement.style.cursor = Boolean(onClick(lastMouse) == null) ? 'default' : 'pointer'
      // console.log( "check", onClick( lastMouse ), Boolean( onClick( lastMouse ) == null ) )

      mouseMoved = false
      // console.timeEnd( "roll" )
    }
  }

  exports.setSize = function (w, h) {
    width = w
    height = h
    pickingTexture.setSize(w, h)
  }

  function onPanStart(e: HammerInput) {
    isPanning = true
    renderer().domElement.style.cursor = 'move'
  }

  function onPanEnd(e: HammerInput) {
    isPanning = false
  }

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

  function onClick(e: ClickEvent): PickableAsset | null | undefined {
    if (cameraControls().state == cameraControls().VISUALIZER_WAVES) return

    lastMouse.x = e.center.x
    lastMouse.y = e.center.y

    if (e.type == 'press') return

    //starts testing the metadat labels

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
        // console.log( "asset already selected");
        return
      }
      //console.log( asset.id, Model.items[ asset.id ], asset );
      cameraControls().gotoAsset(asset)

      if (cameraControls().trackball.enabled && cameraControls().trackball.down)
        cameraControls().trackball.forceMouseUp()
      else if (cameraControls().orbitControls.enabled && cameraControls().orbitControls.down)
        cameraControls().orbitControls.forceMouseUp()
    }

    return asset
  }

  exports.pick = function (x, y) {
    if (atlas()) {
      // if( tsneMesh.mesh )tsneMesh.mesh.visible = false;
      if (tsneSphere.mesh) tsneSphere.mesh.visible = false

      atlas().meshes.forEach(function (m) {
        m.material.material.uniforms.renderUidColor.value = 1
      })

      // three r163 dropped the `renderTarget` argument of `render`: the render
      // target is bound around the call instead (same single pass into
      // `pickingTexture`, then back to the canvas)
      renderer().setRenderTarget(pickingTexture)
      renderer().render(scene(), camera())
      renderer().setRenderTarget(null)

      atlas().meshes.forEach(function (m) {
        m.material.material.uniforms.renderUidColor.value = 0
      })

      // if( tsneMesh.mesh )tsneMesh.mesh.visible = true;
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
