import { Color, Vector3, type PerspectiveCamera } from 'three'
import type { Atlas } from '../atlas/Atlas'
import { PRNG } from '../atlas/utils'
import { shared } from '../Main'
import { atlasInstance, legacyCameraControls, legacyCamera, markRenderNeeded, type FormulaAsset } from '../legacyScope'
import { ColorFormula } from './ColorFormula'
import { RandomFormula, type RandomFormulaAmplitude } from './RandomFormula'

/**
 * Ported from `js/atlas/formulas/bigbang_formula.js`.
 *
 * The "big bang" entry sequence of the freefall application: `reset()` hides
 * every asset behind the berekhat ram, blows the oldest one up to the full
 * random layout and moves the camera along, `randomize()` applies the random
 * formula itself. `app_freefall.js` calls `apply(atlas.assets, commit)` for the
 * `random` sequence, where `commit` tells a first (animated) entry apart from a
 * deep link.
 *
 * Port notes:
 * - the IIFE shape of the original is kept, so `bigbangFormula` stays a single
 *   object with the same two members (`init`, `apply`), registered like the
 *   other formulas (`src/engine/formulas/*.ts`)
 * - `app` and `start` are the two module variables of the original: `app` is
 *   assigned by `init` and never read, `start` is never used at all. Both are
 *   kept for a 1:1 port
 * - the `assets` argument of `apply` is unused in the original too: the formula
 *   always works on `atlas.assets`
 * - the commented out intro block of `apply` is reproduced verbatim; it refers to
 *   the legacy names (`THREE.Vector3`, `Expo.easeIn`) and is not part of the port
 * - `PRNG`, `ColorFormula` and `RandomFormula` come from the ported modules; the
 *   globals of the not-yet-ported `js/camera/cameraControls.js` (`cameraControls`)
 *   and of `src/engine/Main.ts` (`camera`, `atlas`) are read at call time through
 *   the typed getters below
 * - BUGFIX: `camera.lookAt(cameraControls.target)` passed the controls'
 *   `Object3D` instead of its `.position`. three's `lookAt` only accepts a
 *   `Vector3` (or three numbers) and writes `x = <object>`, `y = undefined`,
 *   `z = undefined` into its target, i.e. `NaN` everywhere, which broke the
 *   camera (and with it the whole render) as soon as the reset ran. Every other
 *   place of the legacy engine looks at `target.position` (see
 *   `js/camera/cameraControls.js`), so that is what the port does
 */

/** The camera controls surface this formula drives (`js/camera/cameraControls.js`). */
interface BigbangCameraControls {
  IDLE: number
  VISUALIZER_RANDOM: number
  /** the controls' target `Object3D`: only its `position` is used by this formula */
  target: { position: Vector3 }
  setState(state: number): void
  cameraGoto(position: Vector3, duration?: number, callback?: () => void): void
}

/**
 * `cameraControls` — `js/camera/cameraControls.js`, read at call time.
 * `legacyScope.legacyCameraControls()` exposes the instance but only types the
 * four members the ported camera controls share; the wider surface this formula
 * needs is declared in `BigbangCameraControls`.
 */
function cameraControls(): BigbangCameraControls {
  return legacyCameraControls() as unknown as BigbangCameraControls
}

/** `camera` — the `PerspectiveCamera` created by `initTHREE` (`src/engine/Main.ts`). */
function camera(): PerspectiveCamera {
  return legacyCamera() as unknown as PerspectiveCamera
}

/** `atlas` — the atlas instance created by `appStart` (`src/engine/Main.ts`). */
function atlas(): Atlas {
  return atlasInstance() as unknown as Atlas
}

/** `displayIntroItem`, a mutable primitive owned by `Main`. */
function setDisplayIntroItem(value: boolean): void {
  shared.displayIntroItem = value
}

/** The public surface of the module, i.e. the legacy `bigbangFormula` object. */
export interface BigbangFormula {
  init(app: unknown): void
  apply(assets: FormulaAsset[], commit: boolean): void
}

export const bigbangFormula: BigbangFormula = (function (exports: BigbangFormula) {
  let app: unknown
  let start: unknown

  exports.init = function (_app) {
    app = _app
  }

  exports.apply = function (assets, commit) {
    if (commit) {
      randomize()
      return
    }

    reset()
    /*
    displayIntroItem = true;
    var duration = 4;
    //sends all assets in a line behind the berekhat ram
    PRNG.setSeed(0);
    for (var i = 0, l = atlas.assets.length; i < l; i++) {
        atlas.assets[i].setPosition(
            (PRNG.random() * 2 - 1) * 100000,
            -10000, //( Math.random()*2 - 1 ) * 5000,
            (PRNG.random() * 2 - 1) * 100000
        );
        atlas.assets[i].setColor(0,0,0);
    }

    cameraControls.setState(cameraControls.IDLE);


    var oldestAsset = atlas.getOldestAsset();
    oldestAsset.setPosition(0, 0, 0);
    oldestAsset.setColor(1,1,1);

    var h = oldestAsset.sizeNorm.w;
    cameraControls.targetGoto( oldestAsset.position, 1 );


    var d = camera.position.clone().normalize().multiplyScalar( 60 );
    // d = new THREE.Vector3(-h * 1.5, h * 0.5, 60)

    cameraControls.cameraGoto( d, duration, function(){

        cameraControls.cameraGoto(new THREE.Vector3( 0, 0, 10000 ), 1., function() {

            for (var i = 0, l = atlas.assets.length; i < l; i++) {
                atlas.assets[i].setPosition(
                    (PRNG.random() * 2 - 1),
                    8 + (PRNG.random() * 2 - 1),
                    -10 - i * .5
                );
            }
            new ColorFormula(new THREE.Color(1, 1, 1)).apply(atlas.assets);
            atlas.skipAnimation();

            randomize();

            setTimeout( function () {

                cameraControls.cameraGoto(new THREE.Vector3(camera.position.x, camera.position.y, 1000), 3, function(){
                    displayIntroItem = false;
                } );

            }, 500 );

        }, null, Expo.easeIn);


    } );
    //*/
  }

  function reset() {
    cameraControls().setState(cameraControls().IDLE)
    atlas().mdLabels.labels.forEach(function (label) {
      label.fadeOut()
    })

    setDisplayIntroItem(true)
    cameraControls().target.position.set(0, 0, 0)
    camera().position.set(0, 0, 600)
    // BUGFIX: the original passed the target `Object3D` itself, `lookAt` needs
    // its `position` (three writes NaN otherwise, which broke the camera).
    camera().lookAt(cameraControls().target.position)
    markRenderNeeded()

    //clac
    for (let i = 0, l = atlas().assets.length; i < l; i++) {
      atlas().assets[i].setPosition(
        PRNG.random() * 2 - 1,
        8 + (PRNG.random() * 2 - 1),
        -10 - i * 0.5,
      )
      atlas().assets[i].setColor(0, 0, 0)
    }

    const oldestAsset = atlas().getOldestAsset()
    oldestAsset.setPosition(0, 0, 0)
    oldestAsset.setColor(1, 1, 1)
    atlas().skipAnimation()

    // var duration = 1;
    // cameraControls.cameraGoto(new THREE.Vector3( 0, 0, 15000 ), duration,
    //     function () {

    new ColorFormula(new Color(1, 1, 1)).apply(atlas().assets)
    atlas().skipAnimation()
    randomize()

    cameraControls().cameraGoto(
      new Vector3(camera().position.x, camera().position.y, 1000),
      3,
      function () {
        setDisplayIntroItem(false)
      },
    )

    // }, null, Expo.easeIn);
  }

  function randomize() {
    // apply random formula
    cameraControls().setState(cameraControls().VISUALIZER_RANDOM)
    // the original only passes `x`; only it is read by the 'polar' mode, `y` and
    // `z` stay undefined exactly like they did then (hence the assertion)
    const formula = new RandomFormula(
      {
        x: 7500,
      } as RandomFormulaAmplitude,
      'polar',
      false,
    )
    formula.apply(atlas().assets)

    const oldestAsset = atlas().getOldestAsset()
    oldestAsset.setPosition(0, 0, 0)
  }

  return exports
})({} as BigbangFormula)
