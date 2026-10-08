import * as THREE from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { TrackballControls as TrackballControlsImpl } from 'three/examples/jsm/controls/TrackballControls.js'
import Hammer from 'hammerjs'
import { TweenLite, legacyEases } from '../../legacy/gsapLegacy'
import {
  disableUI as mainDisableUI,
  enableUI as mainEnableUI,
  renderer as mainRenderer,
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
 * Ported from `js/camera/cameraControls.js`.
 *
 * The camera driver of the whole experiment: it owns the `OrbitControls` /
 * `TrackballControls` pair, the shared `target` object, the state machine
 * (visualizers / timeline / curator / machine learning modes), the Hammer and
 * wheel listeners, the deep-link url (de)serialisation and the camera / target
 * tweens driven by TweenLite.
 *
 * The original was a classic script: an IIFE returning its own `exports`
 * object, prefixed by a few module globals (`PI`, `PI2`, `RAD`, `DEG`, `hasNan`,
 * `cc`) and the `lerp` / `norm` / `map` helpers other files also used. The port
 * keeps every member, argument order, constant, timing, easing, event name and
 * state-machine number.
 *
 * Port notes:
 * - `lerp` / `norm` / `map` were declared here (byte-identical bodies to the
 *   shared copies). They now live in `../utils/math`; this file only still uses
 *   `lerp`. The other module constants (`PI`, `PI2`, `RAD`, `DEG`, `hasNan`, `cc`)
 *   are exported for the other camera modules.
 * - `TweenLite` and the `Expo` / `Cubic` eases come from the GSAP 2 facade
 *   (`../../legacy/gsapLegacy`), whose `to(target, duration, vars)` signature
 *   matches the original calls.
 * - `OrbitControls`, `TrackballControls` and `Hammer` are imported from their
 *   npm packages, like the geometry / material / vector classes.
 * - `renderNeeded = true` is written through `markRenderNeeded()`.
 * - The `camera` global is read through `camera()`; the long functions bind it
 *   to a local `cam` (the original re-read the global on every statement).
 * - The state owned by other modules (`renderer`, `params`,
 *   `displayIntroItem`, `disableCameraControls`, `lockLOD`,
 *   `mouseWheelDeltaFactor*`, `disableUI` / `enableUI`, the `atlas` instance)
 *   is read at call time through the small typed helpers below.
 * - `hammer.off('doubletap', onDoubleTap, false)` references a handler that no
 *   file defines: see the ambient declaration below.
 * - The private `hammer` variable became `hammerInstance` (every public member
 *   keeps its name).
 *
 * Fixed while porting (each one documented at its call site):
 * - `update()`'s fail-safe restored the camera with `camera.copy(lastCamera)`
 *   and the target with `camera.copy(lastTarget)`: `Object3D#copy` takes an
 *   `Object3D` (a `Vector3` makes it read `source.up`), and the second call
 *   clearly meant to restore the *target*. Both copy into `.position` now.
 *
 * Kept 1:1 (already broken in the original, reported instead of "fixed"):
 * - `initFromUrl()`'s `duration = duration == null || 0` produces `true` (no
 *   duration passed) or `0` (any other value, positive durations included).
 * - `checkTarPosDistance()` is dead code (its only call is commented out) and
 *   still logs to the console.
 * - `removeListeners()` throws on the undefined `onDoubleTap`; the `try` around
 *   it swallows that, so `pan` / `panend` / `press` / `touchstart` are never
 *   unbound (repeated `addListeners()` would stack Hammer handlers).
 * - `exports.onComplete` / `exports.onControlsChange` are never assigned by any
 *   file of this snapshot (only nulled by `dispose()`), so the "settled" branch
 *   of `update()` is dead and `events.dispatch('update')` always runs.
 */

/**
 * Module constants of `js/camera/cameraControls.js`. The ported controls
 * (`DefaultControls`, `TsneControls`) keep private copies of `PI` / `RAD` to
 * avoid depending on this file's load order.
 */
export const PI = Math.PI
export const PI2 = Math.PI * 2
export const RAD = Math.PI / 180
export const DEG = 180 / Math.PI

/** `hasNan(v)` of `js/camera/cameraControls.js`. */
export function hasNan(v: { x: number; y: number; z: number }): boolean {
  return isNaN(v.x) || isNaN(v.y) || isNaN(v.z)
}

/* ------------------------------------------------------------------------- *
 * Legacy globals still owned by the classic scripts.
 * They are read at call time: they do not exist yet while this module is
 * evaluated / imported.
 * ------------------------------------------------------------------------- */

/** `renderer` (`Main.initTHREE`). */
function renderer(): { domElement: ControlDomElement } {
  return mainRenderer as unknown as { domElement: ControlDomElement }
}

/**
 * Wheel-event feature detection of the original
 * (`window.onwheel !== undefined` / `window.onmousewheel !== undefined`):
 * `onmousewheel` is the old IE name, it is not part of the DOM typings.
 */
function windowWheelHandlers(): { onwheel?: unknown; onmousewheel?: unknown } {
  return window as unknown as { onwheel?: unknown; onmousewheel?: unknown }
}

/** `lockLOD`, locked while the user drags / wheels. */
function lockLOD(): boolean {
  return shared.lockLOD
}

/** `lockLOD`, written by the pointer handlers and by `update()`. */
function setLockLOD(value: boolean): void {
  shared.lockLOD = value
}

/** `disableCameraControls`, set by `disableUI` / `enableUI`. */
function disableCameraControls(): boolean {
  return shared.disableCameraControls
}

/** `displayIntroItem`, true while the freefall intro is shown. */
function displayIntroItem(): boolean {
  return shared.displayIntroItem
}

/** `disableUI` (`Main`): loading overlay + camera lock. */
function disableUI(): void {
  mainDisableUI()
}

/** `enableUI` (`Main`): hides the loading overlay, releases the camera. */
function enableUI(): void {
  mainEnableUI()
}

/** `mouseWheelDeltaFactor`, assigned by `setState`. */
function setMouseWheelDeltaFactor(value: number): void {
  shared.mouseWheelDeltaFactor = value
}

/** `mouseWheelDeltaFactor_default`. */
function mouseWheelDeltaFactorDefault(): number {
  return shared.mouseWheelDeltaFactor_default
}

/** `mouseWheelDeltaFactor_freefall`. */
function mouseWheelDeltaFactorFreefall(): number {
  return shared.mouseWheelDeltaFactor_freefall
}

/**
 * `hammer.off('doubletap', onDoubleTap, false)` (see `removeListeners`) refers to
 * a handler that no file of this snapshot defines. The call sits inside a
 * `try {} catch {}`, so the `ReferenceError` it raises is swallowed exactly like
 * in the classic script. The declaration is ambient (no emitted code) so the
 * port keeps that behaviour instead of silently unbinding another handler.
 */
declare const onDoubleTap: (event: CameraControlEvent) => void

/* ------------------------------------------------------------------------- *
 * Types of the legacy API surface.
 * ------------------------------------------------------------------------- */

/**
 * `renderer.domElement` (`js/main.js`) as this module uses it: the listener
 * calls hand Hammer / wheel / mouse events to the same handlers, which the DOM
 * typings reject for every overload.
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
 * Events handed to the controls and to this module's handlers: the raw wheel
 * event or a Hammer event with a `center` (see `js/camera/cameraControls.js`).
 */
type CameraControlEvent = LegacyWheelEvent & {
  type: string
  preventDefault(): void
  center: { x: number; y: number }
}

/** `Hammer` as this module drives it (the `@types/hammerjs` façade is narrower). */
interface HammerInstance {
  on(event: string, handler: (event: CameraControlEvent) => void, useCapture: boolean): void
  off(event: string, handler: (event: CameraControlEvent) => void, useCapture: boolean): void
  add(recognizer: unknown): void
}

/**
 * three's `OrbitControls` as the legacy code uses it.
 *
 * NOTE: the npm `OrbitControls` (r150+) expects `{ LEFT, MIDDLE, RIGHT }` in
 * `mouseButtons` and no longer reads `ORBIT` / `ZOOM` / `PAN`, and `enableKeys`
 * was removed in r147: this file assigns them anyway (1:1 with the original,
 * the whole camera layer needs the same fix).
 */
interface OrbitControls {
  enabled: boolean
  target: THREE.Vector3
  enableDamping: boolean
  dampingFactor: number
  /** Removed in three r147 (assignment kept 1:1). */
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

/** three's `TrackballControls` as the legacy code uses it. */
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
 * The camera of `js/main.js`.
 *
 * `legacyCamera()` only describes the members the ported atlas uses, while this
 * module also needs `up`, `lookAt` and `copy`: the cast widens it back to the
 * full three camera.
 */
function camera(): THREE.Camera {
  return legacyCamera() as unknown as THREE.Camera
}

/** One asset of the atlas, as this module reads it. */
interface CameraControlsAsset {
  position: THREE.Vector3
  sizeNorm: { w: number; h: number }
  coords: { w: number; h: number }
}

/** One mesh of `atlas.meshes` with the wave uniform animated by `setState`. */
interface CameraControlsMesh {
  material: {
    material: {
      uniforms: Record<string, { value: number }>
    }
  }
}

/**
 * The `atlas` instance (`js/main.js` builds it) with the members this module
 * uses; `atlasInstance()` of `legacyScope` only covers the shared ones.
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

/** One entry of `boundingBoxes` (built by the timeline app). */
interface TimelineBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The controller currently driving the camera (`defaultControls`,
 * `timelineControls` or `tsneControls`). Only the members `cameraControls`
 * calls are described, so the three can be swapped in `setState`.
 */
interface CameraController {
  setState(newState: number): void
  onShift(newState: boolean): void
  /**
   * `onWheel` passes `exports.tweening` as a second argument which all three
   * controllers ignore (kept 1:1).
   */
  mouseHandler(event: CameraControlEvent, tweening?: boolean): void
  update(tweening?: boolean): boolean | void
  constrain(): void
  selectAsset(asset: unknown): void
  onSelectedAssetReached?(): void
}

/** The `cameraControls` global that `js/apps/**` and `js/main.js` drive. */
interface CameraControls {
  time: number

  //timeline bounding box
  timelineHeight: number
  timelineWidth: number
  /** Set by `js/apps/app_freefall.js` (null until then). */
  timelineScroll: unknown
  boundingBoxes: TimelineBoundingBox[] | null
  /** Legacy placeholder, never written (kept 1:1). */
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
  /** Assigned by `setState` only. */
  state: number

  orbitControls: OrbitControls
  trackball: TrackballControls
  target: THREE.Object3D

  /** Never assigned by any file of this snapshot (see the header notes). */
  onControlsChange: ((...args: unknown[]) => void) | null
  /** Never assigned by any file of this snapshot (see the header notes). */
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

  // Created (and never used) by the original: only the commented-out block in
  // `init()` referenced them.
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

  //timeline bounding box
  exports.time = 0 // (the original assigns `time` twice in a row)
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

  // timeout prevent successive calls with osx smoothed mousewheel
  let onCompleteTimeout: ReturnType<typeof setTimeout>
  let locked: boolean
  let isUpdating = false
  let needsRefresh = false
  let shiftDown = false
  let needsUpdate = false

  let selectedAsset: CameraControlsAsset | null
  // Declared but never read by the original either: kept for the 1:1 port.
  let normalCameraDistance = 1

  let hammerInstance: HammerInstance | null = null

  exports.init = function () {
    // exports.sp0 = sphere0;
    // sphere0.scale.multiplyScalar( 2.0 );
    // sphere1 = new THREE.AxisHelper( 500 );
    // exports.sp1 = sphere1;
    // exports.sp2 = sphere2;
    // scene.add( sphere0 );
    // scene.add( sphere1 );
    // scene.add( sphere2 );

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

    //max distance before "releasing" a selected asset
    exports.maxSelectedAssetDistance = lod.maxRange

    //event dispatcher
    events = new EventDispatcher()
    hammerInstance = new Hammer(
      renderer().domElement as unknown as HTMLElement,
    ) as unknown as HammerInstance
    hammerInstance.add(new Hammer.Pan({ direction: Hammer.DIRECTION_ALL, threshold: 0 }))
    hammerInstance.add(new Hammer.Tap({ interval: 0, time: 500, threshold: 5 }))
    exports.addListeners()
  }

  exports.onShift = function (newState: boolean) {
    shiftDown = newState
    controls.onShift(newState)
  }

  function resetOrbitControls() {
    //reset orbit controls
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

  exports.setState = function (newState: number) {
    setMouseWheelDeltaFactor(
      newState == exports.VISUALIZER_RANDOM
        ? mouseWheelDeltaFactorFreefall()
        : mouseWheelDeltaFactorDefault(),
    )
    // for t-sne map see the tsneControls update ----

    //flush variables
    exports.tweening = false
    selectedAsset = null
    controls.selectAsset(null)

    TweenLite.killTweensOf(orbitControls)
    atlasApi().setFogDistance(50000)

    //reset controls
    resetOrbitControls()

    //reset trackball
    resetTrackball()

    //sets the new state
    exports.state = state = newState

    //assign the proper controller depending on the type of distribution
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

    //reset the current controller
    controls.setState(state)

    //removes the wave animation
    for (const mesh of atlasApi().meshes) {
      TweenLite.to(mesh.material.material.uniforms.wavesAmp, 2, {
        value: 0,
        onUpdate: function () {
          markRenderNeeded()
        },
      })
    }

    if (state != exports.MACHINE_TSNE && state != exports.MACHINE_AUTO) {
      exports.targetGoto(ZERO, 1)
    }

    //shift controls
    exports.onShift(false)
  }

  exports.dispose = function () {
    exports.onControlsChange = null
    exports.onComplete = null
    exports.removeListeners()
  }

  exports.removeListeners = function () {
    const dom = renderer().domElement
    try {
      // hammer.off('press', onDown, false);
      hammerInstance.off('panstart', onDown, false)
      hammerInstance.off('release', onUp, false)
      hammerInstance.off('tap', onUp, false)
      // `onDoubleTap` is undefined in every file of this snapshot: this throws
      // (caught below), which is why the `pan` / `panend` handlers after it are
      // never unbound. Kept 1:1.
      hammerInstance.off('doubletap', onDoubleTap, false)
      hammerInstance.off('pan', onMove, false)
      hammerInstance.off('panend', onUp, false)
    } catch (e) {
      // (empty in the original as well)
    }

    // dom.removeEventListener('mousewheel',       onDown, false);
    if (windowWheelHandlers().onwheel !== undefined) {
      dom.removeEventListener('wheel', onDown, false)
    } else if (windowWheelHandlers().onmousewheel !== undefined) {
      dom.removeEventListener('mousewheel', onDown, false)
    }
    dom.removeEventListener('mouseleave', onUp, false)
  }

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

  function onDown(e: CameraControlEvent) {
    if (exports.tweening) return
    locked = lockLOD()
    needsUpdate = true
    controls.mouseHandler(e)
  }

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
      // console.log( "scroll" );
    }
  }

  function onMove(e: CameraControlEvent) {
    if (exports.tweening) return
    setLockLOD(true)
    needsUpdate = true
    controls.mouseHandler(e)
  }

  function onUp(e: CameraControlEvent) {
    if (exports.tweening) return
    needsUpdate = false
    controls.mouseHandler(e)
    setLockLOD(locked)
  }

  // Declared (and never read) by the original, kept for the 1:1 port.
  const ready = true

  function update(forceUpdate?: boolean) {
    const cam = camera()

    //stores the position to compute the minimum delta
    //and eventually call a LOD refresh
    lastCamera.copy(cam.position)
    lastTarget.copy(target.position)

    //calls the controls update
    orbitControls.target = target.position
    trackball.target = target.position
    cam.lookAt(target.position)

    //calls an update on the controller
    isUpdating = false
    if (!exports.tweening && !disableCameraControls())
      // `update()` may return nothing at all: the original stored the raw value
      // and tested it for truthiness.
      isUpdating = Boolean(controls.update(exports.tweening))

    //fail safe
    // FIX: the original wrote `camera.copy( lastCamera )` and
    // `camera.copy( lastTarget )`; `Object3D#copy` expects an `Object3D` (it
    // reads `source.up` and would throw on a `Vector3`) and the second call
    // clearly meant to restore the *target*: both copy into `.position` now.
    if (hasNan(cam.position)) cam.position.copy(lastCamera)
    if (hasNan(target.position)) target.position.copy(lastTarget)

    //check if a render and/or a LOD update are necessary
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

    //releases the selected asset if far enough
    if (!exports.tweening && selectedAsset) {
      if (
        (state == exports.MACHINE_TSNE || state == exports.MACHINE_AUTO) &&
        cam.position.distanceTo(selectedAsset.position) > exports.maxSelectedAssetDistance
      ) {
        selectedAsset = null
        controls.selectAsset(null)
        // console.log('release asset');
      }
    }

    // console.log(exports.info() )
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

  function toUrl() {
    if (legacyParams().isBigWallVersion) return

    const cam = camera()
    if (hasNan(cam.position) || hasNan(target.position)) return

    //prevents deeplink to be created on the freefall intro
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
      url = url.substr(0, url.length - 1) //pops the last comma
    }
    window.location.hash = url
  }
  exports.toUrl = toUrl

  exports.initFromUrl = function (url: string, duration?: number) {
    const camTarget = exports.getPositionsFromURL(url)
    if (camTarget == null) {
      const asset = atlasApi().getAsset(url)
      if (asset) exports.gotoAsset(asset, 2, null, null, 0.5)

      return
    }

    // The original wrote `duration = duration == null || 0`, which evaluates to
    // `true` when no duration is passed and to `0` otherwise (a positive
    // duration is discarded too). Kept 1:1; the cast only adapts the type.
    duration = (duration == null || 0) as unknown as number

    const onComplete = function () {
      exports.forceLod()
    }

    // console.log(camTarget.length);

    if (camTarget.length == 1) {
      exports.cameraGoto(camTarget[0], duration, onComplete)
    }

    if (camTarget.length == 2) {
      exports.cameraGoto(camTarget[0], duration, onComplete)
      exports.targetGoto(camTarget[1], duration)
    }

    // console.log( camTarget );
    setTimeout(exports.forceLod, (duration + 1) * 1000)
  }

  exports.getPositionsFromURL = function (url: string): THREE.Vector3[] | null {
    //"security" check
    //the url arguments should contain only numbers, period and comas
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

    // console.log( data );

    return out
  }

  exports.forceLod = function () {
    lod.setFromCamera()
  }

  exports.cameraGoto = function (
    pos?: THREE.Vector3 | null,
    duration?: number,
    cb?: (() => void) | null,
    onUpdate?: (() => void) | null,
    ease?: unknown,
  ) {
    //TweenLite.killTweensOf(camera.position);

    exports.lockUI()
    pos = pos || ZERO
    exports.tweening = true
    const cam = camera()
    TweenLite.killTweensOf(cam.position)
    TweenLite.to(cam.position, isNaN(duration as number) ? 1 : (duration as number), {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      overwrite: true,
      ease: ease || legacyEases.Expo.easeOut,
      onUpdate: function () {
        if (onUpdate) onUpdate()
        controls.constrain()
        // console.log( camera.position.x, camera.position.y, camera.position.z );
      },
      onComplete: function () {
        exports.tweening = false
        // console.log( "cam tween over", camera.position.x, camera.position.y, camera.position.z );
        // setTimeout( function(){
        //     console.log( "\t > cam tween over", camera.position.x, camera.position.y, camera.position.z );
        // }, 1000 );
        if (cb) cb()
        exports.unlockUI()
      },
    })
  }

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
    TweenLite.killTweensOf(target.position)
    TweenLite.to(target.position, isNaN(duration as number) ? 1 : (duration as number), {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      overwrite: true,
      ease: ease || legacyEases.Expo.easeOut,
      onUpdate: function () {
        if (onUpdate) onUpdate()
        controls.constrain()
        // console.log( target.position.x, target.position.y, target.position.z );
      },
      onComplete: function () {
        exports.tweening = false
        // console.log( "target tween over", target.position.x, target.position.y, target.position.z );
        if (cb) cb()
        exports.unlockUI()
      },
    })
  }

  exports.isSelectedAsset = function (asset: unknown) {
    return asset == selectedAsset
  }

  // Dead code in the original: its only call site (`gotoAsset`) is commented
  // out. Kept 1:1, console logging included.
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
      // NOTE: an id the atlas does not know resolves to `null`, which the
      // original did not check either (`asset.position` below would throw).
      // Kept 1:1.
      asset = atlasApi().getAsset(asset)
    }

    // console.log( asset.id );

    if (displayIntroItem()) return
    // if (selectedAsset == asset) return;

    exports.lockUI()
    selectedAsset = asset
    controls.selectAsset(asset)
    // console.log( '\t select asset' );

    let pos: THREE.Vector3, tar: THREE.Vector3
    const cam = camera()
    const camDist = orbitControls.minDistance //16 *3;//
    const delta = cam.position.clone().sub(asset.position).normalize().multiplyScalar(camDist)
    const upVec = new THREE.Vector3(0, -1, 0) //.applyQuaternion( camera.quaternion ).multiplyScalar(-1);

    pos = asset.position.clone().add(delta).add(upVec)
    tar = asset.position.clone().add(upVec)

    if (state == exports.CURATOR_IDLE) {
      pos.x = tar.x
    }

    //prevent perspective torsion when looking at the 3D timeline
    if (
      state == exports.TIMELINE_3D ||
      state == exports.TIMELINE_FLAT ||
      state == exports.CURATOR_SELECTION ||
      state == exports.CURATOR_COLOR ||
      state == exports.CURATOR_TIMELINE
    ) {
      pos = tar.clone().add(timelineControls.axis.normalize().multiplyScalar(orbitControls.minDistance))
    }

    //prevent perspective torsion when looking at the flat timeline
    // if (state == exports.TIMELINE_FLAT) {
    //     pos.x = asset.position.x;
    //     pos.y = asset.position.y;
    // }

    //locks the view axis towards the center in RANDOM mode
    if (state == exports.VISUALIZER_RANDOM) {
      tar = ZERO
      pos = asset.position
        .clone()
        .normalize()
        .multiplyScalar(asset.position.length() + orbitControls.minDistance)
      selectedAsset = null
      controls.selectAsset(null)

      //special case for berekhat Ram
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

    //TweenLite.killTweensOf(target.position);
    //TweenLite.killTweensOf(camera.position);
    //TweenLite.killTweensOf(exports);

    cameraOrigin.copy(cam.position)
    targetOrigin.copy(target.position)

    //make sure the asset fits in the view
    // pos = checkTarPosDistance( asset, pos,tar );

    exports.tweening = true
    exports.time = 0

    if (typeof delay == 'undefined') delay = 0

    TweenLite.to(exports, isNaN(duration as number) ? 1.5 : (duration as number), {
      time: 1,
      ease: ease || legacyEases.Cubic.easeInOut,
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
        // console.log( "to asset c:", camera.position.x, camera.position.y, camera.position.z );
        // console.log( "to asset t:", target.position.x, target.position.y, target.position.z );
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

/** `cc` (`js/camera/cameraControls.js`) is an alias of the same object. */
export const cc = cameraControls
