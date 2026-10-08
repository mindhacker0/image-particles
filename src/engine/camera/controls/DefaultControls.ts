import * as THREE from 'three'
import { gsap } from 'gsap'
import { cameraControls as engineCameraControls } from '../CameraControls'
import { shared } from '../../Main'
import { legacyCamera, legacyScene } from '../../legacyScope'
import { normalizeWheel, type LegacyWheelEvent } from '../../utils/functions'
import { lerp, map, norm } from '../../utils/math'

/**
 * Ported from `js/camera/controls/defaultControls.js`.
 *
 * Mouse controls of the curator table (drag + wheel), the trackball hand-over
 * used by the random and sphere visualizers and the polar limits of the waves
 * layout.
 *
 * The original was an IIFE returning its own `exports` object; the port keeps
 * every member, argument order and default value, and is meant to be published
 * as the `defaultControls` global that `js/camera/cameraControls.js` drives.
 *
 * Port notes:
 * - `PI` / `RAD` are globals of the not-yet-ported `js/camera/cameraControls.js`
 *   declared with exactly these values: the local copies remove the load-order
 *   dependency on that file.
 * - `lerp` / `norm` / `map` were globals of that same file with the exact same
 *   bodies as `src/engine/utils/math.ts` -> imported from there.
 * - `lastMouse` is a `Vector2` but the original called `set(x, y, 0)` (a
 *   Vector3 shaped call): three ignores the extra argument, so it is dropped.
 * - `exports.axisDistance` is read / written by the wheel case but the original
 *   never assigns it a first value (see `mouseHandler`): kept uninitialised.
 * - Globals still owned by classic scripts (`cameraControls`, `camera`,
 *   `scene`, `mouseWheelDeltaFactor`, `CuratorChapter`) are read at call time
 *   through the small typed helpers below.
 */

/**
 * Declared by `js/camera/cameraControls.js` as `Math.PI` / `Math.PI / 180`.
 * Kept local so this module can be imported before that classic script runs.
 */
const PI = Math.PI
const RAD = Math.PI / 180

/* ------------------------------------------------------------------------- *
 * Legacy globals still owned by the classic scripts.
 * They are read at call time: they do not exist yet while this module is
 * evaluated / imported.
 * ------------------------------------------------------------------------- */

/**
 * `CuratorChapter` (the rasterfairy bounds of the curator table) is read by
 * `update()` but no file of this snapshot defines it: the curator chapter app
 * is not part of this build. The declaration is ambient (no emitted code), so
 * the `CURATOR_IDLE` drag branch still throws a ReferenceError exactly like the
 * classic script.
 */
declare const CuratorChapter: { min: { x: number; y: number }; max: { x: number; y: number } }

/** `mouseWheelDeltaFactor`, reassigned by `cameraControls.setState`. */
function mouseWheelDeltaFactor(): number {
  return shared.mouseWheelDeltaFactor
}

/**
 * three's `OrbitControls` with the legacy `mouseButtons` key names.
 *
 * NOTE: the npm `OrbitControls` (r150+) expects `{ LEFT, MIDDLE, RIGHT }` and
 * no longer reads `ORBIT` / `ZOOM` / `PAN`, which the original assigns here
 * (and `js/camera/cameraControls.js` everywhere): the button mapping silently
 * stops working. Kept 1:1, the whole camera layer needs the same fix.
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

/** three's `TrackballControls` as this module uses it. */
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

/** `cameraControls` (`js/camera/cameraControls.js`) as this module uses it. */
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
 * Events handed to `mouseHandler`: the raw wheel event (normalized by
 * `normalizeWheel`) or a Hammer event with a `center` (see
 * `js/camera/cameraControls.js`).
 */
type DefaultControlEvent = LegacyWheelEvent & {
  type: string
  center: { x: number; y: number }
}

/** The `defaultControls` global consumed by `js/camera/cameraControls.js`. */
interface DefaultControls {
  axis: THREE.Vector3
  distance: number
  /**
   * `undefined` at runtime: the original reads and writes it in the wheel case
   * without ever assigning a first value, so any zoom makes it `NaN`.
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

  exports.init = function () {
    orbitControls = cameraControls().orbitControls
    trackball = cameraControls().trackball
    target = cameraControls().target
  }

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
        orbitControls.minPolarAngle = RAD * 5 //PI * .5 - RAD * 30;
        orbitControls.maxPolarAngle = PI * 0.5 - RAD * 5
        orbitControls.maxDistance = 10000

        // gsap.to( orbitControls, 2, {
        //     minPolarAngle:RAD * 5,
        //     maxPolarAngle:PI * .5 - RAD * 5,
        //     maxDistance: 10000
        // } );

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

  exports.onShift = function (newState: boolean) {
    //app.hideShift();
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

  exports.mouseHandler = function (event: DefaultControlEvent) {
    if (cameraControls().tweening) return

    switch (event.type) {
      case 'wheel':
      case 'mousewheel': {
        // NOTE: `exports.axisDistance` is never initialised (see the member
        // documentation): this computes `NaN` in the original as well.
        const delta = -normalizeWheel(event).spinY * mouseWheelDeltaFactor()
        //var delta = (e.wheelDelta && e.wheelDelta !== undefined)? e.wheelDelta : e.deltaY;
        // exports.distance += -e.wheelDelta * .25;
        // exports.distance = Math.max( orbitControls.minDistance, Math.min( exports.distance, orbitControls.maxDistance ) );

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

  exports.update = function (): boolean | void {
    if (!ready) return false

    if (cameraControls().tweening) return false

    const camera = legacyCamera()

    //curator table: recomputes the distance to target during the tweens
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
    //sphere: always remain outside
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
      //drag
      target.position.add(drag)
      drag.multiplyScalar(0.9)
      if (drag.length() < 0.1 && !drag.equals(ZERO)) {
        drag.set(0, 0, 0)
        cameraControls().forceLod()
      }

      //binds target to Rasterfairy grid
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
  // The original never calls this helper (dead code kept for the 1:1 port).
  function createSphere(p: THREE.Vector3, c?: number) {
    const s = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: c || 0x000000 }))
    s.position.copy(p)
    legacyScene().add(s)
    return s
  }

  exports.constrain = function () {
    // if( state == cameraControls.CURATOR_IDLE
    // ||  state == cameraControls.CURATOR_SELECTION
    // ||  state == cameraControls.CURATOR_COLOR
    // ||  state == cameraControls.CURATOR_TIMELINE
    // ){
    // console.log( "constrain" );
    //
    // exports.distance = camera.position.distanceTo( target.position );
    // var p = target.position.clone().add( exports.axis.normalize().multiplyScalar( exports.distance ) );
    // camera.position.copy( p );
    // camera.position.x += ( p.x - camera.position.x ) * .05;
    // camera.position.y += ( p.y - camera.position.y ) * .05;
    // camera.position.z += ( p.z - camera.position.z ) * .05;
    // }
  }

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
