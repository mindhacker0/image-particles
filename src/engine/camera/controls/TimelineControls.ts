import * as THREE from 'three'
import { TweenLite } from '../../../legacy/gsapLegacy'
import { atlasInstance, legacyCamera, legacyParams } from '../../legacyScope'
import { dateLabels } from '../../atlas/DateLabels'
import { type LegacyWheelEvent } from '../../utils/functions'
import { norm } from '../../utils/math'

/**
 * Ported from `js/camera/controls/timelineControls.js`.
 *
 * Camera controls of the timeline chapters: the flat (2D) and the perspective
 * (3D) timeline, the curator selection modes and the URL / year entry point.
 *
 * The original was an IIFE returning its own `exports` object; the port keeps
 * every member, argument order and default value and is meant to be published
 * as the `timelineControls` global driven by `js/camera/cameraControls.js` and
 *
 * Port notes:
 * - `lerp` / `norm` / `map` used to be globals of the not-yet-ported
 *   `js/camera/cameraControls.js`; `norm` is imported from `utils/math.ts`
 *   (same body).
 * - `dateLabels` is imported from the ported `atlas/DateLabels.ts` instead of
 *   reading the global of the same name.
 * - `atlas`, `camera`, `params` and `mouseWheelDeltaFactor` are still owned by
 *   classic scripts and are read at call time through the helpers below.
 * - `mouseHandler` re-reads `cameraControls.tweening` into a local variable
 *   right after returning on the very same condition, so that variable is
 *   always `false`: dead code kept as-is (it has no effect on behaviour).
 * - three's `OrbitControls` (r150+) replaced the `mouseButtons` keys
 *   `ORBIT` / `ZOOM` / `PAN` with `LEFT` / `MIDDLE` / `RIGHT`, so the
 *   assignments below no longer change the button mapping (same issue in
 *   `js/camera/cameraControls.js`): kept 1:1.
 */

/* ------------------------------------------------------------------------- *
 * Legacy globals still owned by the classic scripts.
 * They are read at call time: they do not exist yet while this module is
 * evaluated / imported.
 * ------------------------------------------------------------------------- */

/** `mouseWheelDeltaFactor` (`js/main.js`), reassigned by `cameraControls.setState`. */
function mouseWheelDeltaFactor(): number {
  return (window as unknown as { mouseWheelDeltaFactor: number }).mouseWheelDeltaFactor
}

/** One entry of `cameraControls.boundingBoxes` (built by the timeline app). */
interface TimelineBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * three's `OrbitControls` with the legacy `mouseButtons` key names (see the
 * port note in the header).
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

/** `cameraControls` (`js/camera/cameraControls.js`) as this module uses it. */
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
  return (window as unknown as { cameraControls: TimelineControlsContext }).cameraControls
}

/**
 * `setFogDistance` / `skipAnimation` are not part of the `atlasInstance()` view
 * (`js/atlas/atlas.js`).
 */
interface TimelineAtlas {
  setFogDistance(value: number, duration?: number): void
  skipAnimation(): void
}

function atlasApi(): TimelineAtlas {
  return atlasInstance() as unknown as TimelineAtlas
}

/** The timeline scrollbar built by `js/apps/timeline/timescroll.js`. */
interface Timescroll {
  /** Bounds of the given year's block (the original reads `x` / `y`). */
  getBoundingBoxByYear(year: number): { x: number; y: number }
}

/**
 * Events handed to `mouseHandler`: the raw wheel event (the legacy `wheelDelta`
 * / `deltaY` branches are inlined here, `normalizeWheel` is commented out in
 * the original) or a Hammer event with a `center`.
 */
type TimelineControlEvent = LegacyWheelEvent & {
  type: string
  center: { x: number; y: number }
}

/** The `timelineControls` global consumed by `js/camera/cameraControls.js`. */
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

  exports.init = function () {
    orbitControls = cameraControls().orbitControls
    target = cameraControls().target
  }

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
        // TweenLite.to( exports.axis, 1, { x:axis3D.x, y:axis3D.y, z:axis3D.z } );
        exports.axis = axis3D

        exports.axisDistance = Math.min(
          2500,
          legacyCamera().position.distanceTo(target.position),
        )
        // TweenLite.to( exports, 1, { axisDistance : Math.min( 2500, camera.position.distanceTo( target.position ) ) } );

        dest = target.position
          .clone()
          .add(axis3D.normalize().multiplyScalar(exports.axisDistance))
        cameraControls().cameraGoto(dest, motionDuration)

        atlasApi().setFogDistance(20000, motionDuration)
        TweenLite.to(orbitControls, motionDuration, { maxDistance: 2500 })

        orbitControls.enableZoom = false
        dateLabels.hide(motionDuration)

        break

      case cameraControls().TIMELINE_FLAT:
        orbitControls.enableZoom = true

        // TweenLite.to( exports.axis, 1, { x:axis2D.x, y:axis2D.y, z:axis2D.z } );
        exports.axis = axis2D

        cameraControls().cameraGoto(
          new THREE.Vector3(target.position.x, target.position.y, exports.axisDistance),
          motionDuration,
        )

        atlasApi().setFogDistance(50000, motionDuration)
        TweenLite.to(orbitControls, motionDuration, { maxDistance: 10000 })
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

        // atlas.setFogDistance( 50000, 2 );
        TweenLite.to(orbitControls, motionDuration, { maxDistance: 10000 })

        break
    }

    getTimelineBoundingBox()
    ready = true
  }

  exports.setFirstLocation = function (timescroll: Timescroll, year?: number) {
    let duration = 3
    TweenLite.to(exports, duration, { axisDistance: 2500 })

    //starts at provided year
    const bounds = timescroll.getBoundingBoxByYear(year || 0)
    const center = new THREE.Vector3(bounds.x, bounds.y + 300, 0)
    const tarDest = new THREE.Vector3(center.x, center.y, 0)

    const camDest = tarDest
      .clone()
      .add(exports.axis.normalize().multiplyScalar(exports.axisDistance))

    const params = legacyParams()
    if (params.initHash && params.initHash !== '') {
      // console.log( "from URL >", params.initHash );
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

    //go to
    //cameraControls.onShift(camDest, duration );
    cameraControls().cameraGoto(camDest, duration)
    cameraControls().targetGoto(tarDest, duration)
  }

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

  exports.mouseHandler = function (event: TimelineControlEvent) {
    if (cameraControls().tweening) return
    const tweening = cameraControls().tweening

    switch (event.type) {
      case 'wheel':
      case 'mousewheel':
        if (!tweening) {
          //var delta = -normalizeWheel(e).spinY * 10;
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
  exports.update = function (tweening?: boolean): boolean | void {
    // exports.axisDistance = camera.position.distanceTo(target.position);
    // console.log( exports.axisDistance );
    if (!ready) return false
    if (cameraControls().tweening) return
    //picks the highest point to compute the upper bound
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

    //X axis: keeps the camera in front of the timeline's bounds
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

    //Y axis: maintian the camera & target between 0 and the highest bound
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

    // console.log( lowerBound, upperBound );

    //Z axis: lock to 0
    target.position.z = 0

    if (state == cameraControls().TIMELINE_3D || state == cameraControls().TIMELINE_FLAT) {
      target.position.x += deltaPoint.x * r
      target.position.y += deltaPoint.y * r
      p = target.position
        .clone()
        .add(exports.axis.normalize().multiplyScalar(exports.axisDistance))
      camera.position.copy(p)

      // }
      // else
      // {
      //     camera.position.x += ( target.position.x - camera.position.x ) * .1;
      //     camera.position.y += ( target.position.y - camera.position.y ) * .1;
    }
    return orbitControls.update()
  }

  exports.constrain = function () {
    // if( state == cameraControls.TIMELINE_FLAT ){
    //
    //     // console.log("yo", target.position.x - camera.position.x, target.position.y - camera.position.y );
    //     camera.position.x = target.position.x;
    //     camera.position.y = target.position.y;
    // }
  }

  function getTimelineBoundingBox() {
    // console.log( "getTimelineBoundingBox", cameraControls.boundingBoxes, cameraControls.timelineWidth )
    if (cameraControls().boundingBoxes == null || cameraControls().boundingBoxes.length == 0) {
      upperBound = 100000
      lowerBound = -100000
      return
    }
    if (cameraControls().boundingBoxes.length == 1) {
      box = cameraControls().boundingBoxes[0]
      upperBound = box.height
      // console.log(box)
      return box
    }

    //if the box contains the target
    const x = target.position.x
    let boxId: number
    cameraControls().boundingBoxes.forEach(function (b, i, a) {
      if (x >= b.x && x <= b.x + b.width) {
        box = b
        boxId = i
      }
    })

    if (isNaN(boxId)) return

    //computes the upper limit to block camera based on the current box' neighbours
    upperBound = box.height

    const off = 15
    const cin = Math.max(0, boxId - off)
    const cout = Math.min(boxId + off, cameraControls().boundingBoxes.length)

    for (let i = cin; i < cout; i++) {
      upperBound = Math.max(upperBound, cameraControls().boundingBoxes[i].height)
    }
    upperBound += 10
  }

  exports.selectAsset = function (asset: unknown) {
    selectedAsset = asset
    if (asset) TweenLite.to(exports, 1, { axisDistance: orbitControls.minDistance })
  }

  return exports
})({} as TimelineControls)
