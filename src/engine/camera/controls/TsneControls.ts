import * as THREE from 'three'
import { legacyCamera } from '../../legacyScope'
import { norm } from '../../utils/math'

/**
 * Ported from `js/camera/controls/tsneControls.js`.
 *
 * Camera controls of the t-SNE visualizer: the target follows the pointer on
 * the height map (`shootTarget`), the camera drags the whole scene and the
 * wheel factor is adapted to the distance to the ground.
 *
 * The original was an IIFE returning its own `exports` object; the port keeps
 * every member, argument order and default value and is meant to be published
 * as the `tsneControls` global driven by `js/camera/cameraControls.js`.
 *
 * Port notes:
 * - `PI` / `RAD` are globals of the not-yet-ported `js/camera/cameraControls.js`
 *   declared with exactly these values: the local copies remove the load-order
 *   dependency on that file.
 * - `norm` used to be a global of that same file with the exact same body as
 *   `src/engine/utils/math.ts` -> imported from there.
 * - `Hammer` comes from `src/legacy/globals.ts` (npm `hammerjs`); the members
 *   used here (`inherit`, `MouseInput`, `Input`, `INPUT_*`) are missing from
 *   `@types/hammerjs`, hence the local interface.
 * - `lastMouse` is a `Vector2` but the original called `set(x, y, 0)` (a
 *   Vector3 shaped call): three ignores the extra argument, so it is dropped.
 * - `raycaster.ray.intersectPlane(plane)` lost its one argument form in r125,
 *   it now writes into a target vector: the port passes a module local scratch
 *   vector (the original three allocated one per call).
 * - `state` is only read by `mouseHandler` and never assigned: `setState()` of
 *   this module takes no argument, so `state == MACHINE_AUTO` is always false
 *   in the original as well (kept 1:1).
 * - Immutable globals of classic scripts (`cameraControls`, `camera`,
 *   `ImageTsneFormula`, `tsneMesh`, `lockLOD`, `mouseWheelDeltaFactor*`) are
 *   read / written at call time through the helpers below.
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
 * The t-SNE height map formula is read by `getGroundLevel` below but no file of
 * this snapshot defines it (the ported `js/data/models.js` writes it in
 * `getTsne`): the original build shipped a formula script that is missing here.
 * The declaration is ambient (no emitted code), so reaching it at runtime still
 * throws a ReferenceError exactly like the classic script.
 */
declare const ImageTsneFormula: { getHeightAt(x: number, y: number): number }

/**
 * `shootTarget` raycasts against `tsneMesh.mesh` but no file of this snapshot
 * defines `tsneMesh`: the sphere module publishes `tsneSphere`
 * (`src/engine/atlas/TsneSphere.ts`, ported from the now deleted
 * `js/atlas/tsneSphere.js`) and `js/camera/clickManager.js` uses the same stale
 * name in commented-out code, so `tsneSphere` is the likely intent. Kept as an
 * ambient declaration so the port does not silently start raycasting against a
 * different object than the classic script did.
 */
declare const tsneMesh: { mesh: THREE.Object3D }

/** `lockLOD` (`js/main.js`), written by `update`. */
function setLockLOD(value: boolean): void {
  ;(window as unknown as { lockLOD: boolean }).lockLOD = value
}

/** `mouseWheelDeltaFactor_tsne_min` (`js/main.js`). */
function mouseWheelDeltaFactorTsneMin(): number {
  return (window as unknown as { mouseWheelDeltaFactor_tsne_min: number })
    .mouseWheelDeltaFactor_tsne_min
}

/** `mouseWheelDeltaFactor_tsne_max` (`js/main.js`). */
function mouseWheelDeltaFactorTsneMax(): number {
  return (window as unknown as { mouseWheelDeltaFactor_tsne_max: number })
    .mouseWheelDeltaFactor_tsne_max
}

/** `mouseWheelDeltaFactorOrbit` (`js/main.js`), written by `update`. */
function setMouseWheelDeltaFactorOrbit(value: number): void {
  ;(window as unknown as { mouseWheelDeltaFactorOrbit: number }).mouseWheelDeltaFactorOrbit =
    value
}

/**
 * `Hammer` (installed from npm by `src/legacy/globals.ts`) with the members the
 * original uses to patch the mouse input.
 */
interface HammerStatic {
  INPUT_START: number
  INPUT_MOVE: number
  INPUT_END: number
  Input: unknown
  MouseInput: unknown
  inherit(child: unknown, base: unknown, properties: Record<string, unknown>): void
}

function hammer(): HammerStatic {
  return (window as unknown as { Hammer: HammerStatic }).Hammer
}

/** The `this` of the patched Hammer mouse input (see `Hammer.MouseInput`). */
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
 * three's `OrbitControls` with the legacy `mouseButtons` key names.
 *
 * NOTE: the npm `OrbitControls` (r150+) expects `{ LEFT, MIDDLE, RIGHT }` and
 * no longer reads `ORBIT` / `PAN`, which the original reads here (and
 * `js/camera/cameraControls.js` everywhere): the button mapping silently stops
 * working. Kept 1:1, the whole camera layer needs the same fix.
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

/** `cameraControls` (`js/camera/cameraControls.js`) as this module uses it. */
interface TsneControlsContext {
  tweening: boolean
  orbitControls: LegacyOrbitControls
  target: THREE.Object3D
  MACHINE_AUTO: number
  forceLod(): void
}

function cameraControls(): TsneControlsContext {
  return (window as unknown as { cameraControls: TsneControlsContext }).cameraControls
}

/**
 * Events handed to `mouseHandler`: the raw wheel event or a Hammer event with a
 * `center` (see `js/camera/cameraControls.js`).
 */
type TsneControlEvent = {
  type: string
  center: { x: number; y: number }
}

/** The `tsneControls` global consumed by `js/camera/cameraControls.js`. */
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
  // r125+ writes the plane intersection into this target instead of returning a
  // freshly allocated vector.
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

  exports.init = function () {
    orbitControls = cameraControls().orbitControls
    target = cameraControls().target

    //extend to allow right click

    //input mouse map is not a public property of Hammer, so copy it here
    const Hammer = hammer()
    const MOUSE_INPUT_MAP: Record<string, number> = {
      mousedown: Hammer.INPUT_START,
      mousemove: Hammer.INPUT_MOVE,
      mouseup: Hammer.INPUT_END,
    }
    //override
    Hammer.inherit(Hammer.MouseInput, Hammer.Input, {
      handler: function MEhandler(this: HammerMouseInput, ev: HammerMouseEvent) {
        let eventType = MOUSE_INPUT_MAP[ev.type]

        //modified to handle all buttons
        //left=0, middle=1, right=2
        if (eventType & Hammer.INPUT_START) {
          //firefox sends button 0 for mousemove, so store it here
          if (this.pressed === false) this.button = ev.button
          this.pressed = true
        }

        if (eventType & Hammer.INPUT_MOVE && ev.which === 0) {
          eventType = Hammer.INPUT_END
        }
        // mouse must be down, and mouse events are allowed (see the TouchMouse input)
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

  exports.getYOffset = function (pos?: THREE.Vector3, offset?: unknown): number {
    const p = pos || legacyCamera().position
    return Math.max(exports.getGroundLevel(p, offset), p.y)
  }

  exports.getGroundLevel = function (pos?: THREE.Vector3, offset?: unknown): number {
    const p = pos || legacyCamera().position
    const groundOffset = offset == null || Boolean(offset) ? 8 : 0
    return ImageTsneFormula.getHeightAt(p.x, p.z) + groundOffset
  }

  exports.setState = function () {
    orbitControls.enableRotate = false
    orbitControls.enablePan = false
    orbitControls.enableZoom = false

    orbitControls.maxDistance = 35000 //15000

    orbitControls.minPolarAngle = PI * 0.5 - RAD * 85
    orbitControls.maxPolarAngle = PI * 0.5 - RAD * 5

    ready = true
  }

  exports.onShift = function (newState: boolean) {
    shiftDown = newState
    orbitControls.enableZoom = true
    orbitControls.enablePan = false
    orbitControls.enableRotate = true
    if (shiftDown) {
      if (exports.shoot) shootTarget()
    }
  }

  exports.mouseHandler = function (event: TsneControlEvent) {
    if (state == cameraControls().MACHINE_AUTO) return
    if (cameraControls().tweening) return
    if (exports.locked) return

    switch (event.type) {
      case 'wheel':
      case 'mousewheel':
        //TODO zoom sans orbit + bind to interface buttons
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
          //if( orbitControls.mouseButtons.ORBIT == e.button ){
          lastMouse.set(event.center.x, event.center.y)
          drag.set(0, 0, 0)
        }

        //if( orbitControls.mouseButtons.PAN == e.button ){
        if (!shiftDown) {
          //drag
          //keep delta proportional to camera distance
          // var n = norm( camera.position.distanceTo(target.position), orbitControls.minDistance, orbitControls.maxDistance  );
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

  function shootTarget() {
    raycaster.setFromCamera(
      // `center` is the plain `{ x, y }` object of the original: the middle of
      // the screen (NDC 0, 0), which three's `setFromCamera` only reads x / y
      // from. `legacyCamera()` only describes the members the ported atlas uses.
      center as unknown as THREE.Vector2,
      legacyCamera() as unknown as THREE.Camera,
    )
    const meshHits = raycaster.intersectObject(tsneMesh.mesh)

    let ip = target.position

    // var out = 'd: '+ camera.position.distanceTo( cameraControls.target.position ).toFixed( 0 ) +  ' ';
    if (meshHits.length) {
      // on the mesh grid

      ip = meshHits[0].point
      // out += ( "mesh: " + camera.position.distanceTo( ip ).toFixed( 0 ) );
    } else {
      // infinite plane

      const planeHit = raycaster.ray.intersectPlane(plane, planeIntersection)

      if (planeHit != null) {
        if (ip.distanceTo(legacyCamera().position) < exports.shootDistance) {
          ip = planeHit
          // out += ( "plane: " + camera.position.distanceTo( ip ).toFixed( 0 ) );
        }
      }
    }
    target.position.copy(ip)

    // console.log( out );
  }

  exports.update = function (): boolean | void {
    if (!ready) return false
    if (cameraControls().tweening) return false
    if (exports.locked) return false

    orbitControls.mouseButtons.PAN = shiftDown ? THREE.MOUSE.RIGHT : THREE.MOUSE.LEFT
    orbitControls.mouseButtons.ORBIT = shiftDown ? THREE.MOUSE.LEFT : THREE.MOUSE.RIGHT

    const camera = legacyCamera()

    //drag
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

    //recentrer target after 80° of max dist
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
      // ZOOM FACTOR ACCORDING TO THE DISTANCE TO TARGET
      //mouseWheelDeltaFactorOrbit = mouseWheelDeltaFactor_tsne_min+n*(mouseWheelDeltaFactor_tsne_max-mouseWheelDeltaFactor_tsne_min);
      setMouseWheelDeltaFactorOrbit(
        mouseWheelDeltaFactorTsneMin() +
          factor * (mouseWheelDeltaFactorTsneMax() - mouseWheelDeltaFactorTsneMin()),
      )
    }

    // cameraControls.sp0.position.copy( target.position );

    return orbitControls.update()
  }

  exports.constrain = function () {
    // exports.update();
  }

  exports.selectAsset = function (asset: unknown) {
    selectedAsset = asset
    //app.shiftToggle.uncheck();
  }

  return exports
})({} as TsneControls)
