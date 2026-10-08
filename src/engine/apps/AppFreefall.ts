import { Color, Vector3, type Object3D, type PerspectiveCamera } from 'three'
import { gsap } from 'gsap'
import { ChapterUi } from '../../ui/ChapterUi'
import type { Asset } from '../atlas/Asset'
import type { Atlas } from '../atlas/Atlas'
import { dateLabels } from '../atlas/DateLabels'
import { PRNG } from '../atlas/utils'
import { introItem } from '../apps/freefall/IntroItem'
import { Timescroll, type TimescrollBBox } from '../apps/timeline/Timescroll'
import { timelineControls } from '../camera/controls/TimelineControls'
import { getDates } from '../data/Models'
import { ColorFormula } from '../formulas/ColorFormula'
import { RandomFormula, type RandomFormulaAmplitude } from '../formulas/RandomFormula'
import { SphereFormula } from '../formulas/SphereFormula'
import { WaveFormula } from '../formulas/WaveFormula'
import {
  atlasInstance,
  legacyCamera,
  legacyCameraControls,
  legacyParams,
  markRenderNeeded,
} from '../legacyScope'
import { animate as mainAnimate, enableUI as mainEnableUI, setup as mainSetup, shared } from '../Main'
import { bigbangFormula } from '../formulas/BigbangFormula'
import { getCurrentUrl } from '../utils/functions'
import { Sidect } from '../../ui/sidecontent/SideContentFacade'

/**
 * Ported from `js/apps/app_freefall.js` (the main application of the freefall
 * chapter).
 *
 * The original was a constructor function (`var App = function (camera) {...}`)
 * with prototype methods; it is ported as `export class App` with the very same
 * constructor signature (`new App(camera)`, called by `js/main.js` `setup()`),
 * the same method names and the same instance members — including the ones that
 * were only assigned inside the constructor (`this.ui`, `this.timescroll`,
 * `this.sideContent`, `this.editorPanel`, `this.currentColor`, `this.atlas`, ...).
 *
 * Port notes
 * ----------
 * - the equivalent of a method's `this` member is the same `this.X` name; the
 *   legacy globals the methods read are looked up at call time through the
 *   helpers below (see "Legacy globals owned by the not-yet-ported classic
 *   scripts") or through `src/engine/legacyScope.ts`, so the module can be
 *   imported before those globals exist
 * - `params`, `atlas` and `cameraControls` are still owned by classic scripts.
 *   They are read into a local `const` at the top of the method that uses them
 *   (exactly like the original read the global): `params` is a single object
 *   created by `js/main.js`, and the two writes to `params.initHash` /
 *   `params.directSub` therefore still reach every module.
 *   `update()` keeps using the `this.cameraControls` snapshot of the constructor
 *   (the original read the global there, which is the same object)
 * - `displayIntroItem` (and the other shared mutable primitives of `js/main.js`)
 *   are read / written through `window` (see `LegacyWindowPrimitives`), never
 *   copied into a module local, so the ported modules and the remaining classic
 *   scripts keep sharing one value
 * - already ported modules replaced the globals of the same name: `ChapterUi`,
 *   `Atlas` (through `atlasInstance()`), `dateLabels`, `introItem`,
 *   `Timescroll`, `timelineControls`, the formulas, `getDates`, `getCurrentUrl`,
 *   `PRNG`, `gsap`, `markRenderNeeded` (`renderNeeded = true`)
 * - `bigbangFormula` (`js/atlas/formulas/bigbang_formula.js`), `Sidect`
 *   (`js/ui/sidect.js`), `enableUI` / `animate` / `setup` (`js/main.js`) and
 *   `cameraControls` (`js/camera/cameraControls.js`) are not ported yet: they are
 *   local typed getters marked `// legacy global owned by js/...`
 * - `.bind(this)` callbacks became arrow functions (same binding; no callback
 *   here relies on `this` or on `arguments`)
 * - the last statement of the original, `setup(window.innerWidth,
 *   window.innerHeight)`, was the engine bootstrap: it ran as soon as the classic
 *   script was evaluated, i.e. after every file of the load order had been
 *   loaded. It must not run at import time any more, so it is exported as
 *   `bootFreefall()`, which the engine loader calls once all the ported modules
 *   have been installed
 *
 * Latent bugs (see the inline comments)
 * ------------------------------------
 * - FIXED: `showIntroDistribution` called `camera.lookAt(cameraControls.target)`,
 *   passing the `Object3D` where three reads `x`/`y`/`z`: the argument is now
 *   `cameraControls.target.position`, like every other call site of the project
 * - `mdl.fadeOut(2)` passed a duration the label never used (the ported
 *   `MetadataLabel.fadeOut()` hardcodes 0.6s): the argument is dropped
 * - `new RandomFormula({ x: 7500 }, 'polar', false)` omits `y` / `z`, but the
 *   polar mode only ever reads `amp.x` (kept, documented at the call sites)
 * - `startScrollNoDatesItems` ignores its `seq` / `initialisedCamera` arguments
 *   (kept for signature parity)
 */

/* ------------------------------------------------------------------------- *
 * Shared mutable primitives
 * ------------------------------------------------------------------------- */

/**
 * Mutable primitives owned by `js/main.js` (the classic render loop) that
 * several modules share. `displayIntroItem` is the only one this file touches;
 * they all live on `window` so that a ported module and a classic script always
 * see the same value.
 */
interface LegacyWindowPrimitives {
  /** blocks the LOD from loading (`js/main.js`) — written by other modules */
  lockLOD: boolean
  /** hides the labels during the freefall intro (`js/main.js`) — other modules */
  hideMetadata: boolean
  /**
   * hides the links of the first item's label. Set by `App.setup`-driven intro
   * (`start()`) and read by `src/engine/atlas/Metadatas.ts` / `js/main.js`; the
   * `animate` loop skips LOD updates while it is `true`.
   */
  displayIntroItem: boolean
  /** preloader counters (`js/main.js` `appStart` / `updateLoader`) — other modules */
  numAssetsLoaded: number
  numAssetsTotal: number
  numPartners: number
  /** renderer size (`js/main.js` `initTHREE`) — other modules */
  rendererWidth: number
  rendererHeight: number
  /** wheel factors (`js/main.js`, reset by `cameraControls.setState`) — other modules */
  mouseWheelDeltaFactor: number
  mouseWheelDeltaFactorOrbit: number
  /**
   * `true` when a frame has to be rendered (`js/main.js` `animate`). Other
   * modules, and this one, set it through `markRenderNeeded()`.
   */
  renderNeeded: boolean
}

function legacyWindow(): LegacyWindowPrimitives {
  return shared
}

/* ------------------------------------------------------------------------- *
 * Legacy globals owned by the not-yet-ported classic scripts
 * ------------------------------------------------------------------------- */

/** `bigbangFormula` (`js/atlas/formulas/bigbang_formula.js`). */
interface BigbangFormula {
  /**
   * `commit` was passed as the raw `params.initHash && params.initHash !== ''`
   * expression of the caller, i.e. a string when a hash was present; the formula
   * only tests it for truthiness, so the type keeps both cases.
   */
  apply(assets: Asset[], commit: boolean | string): void
}

/** the `bigbangFormula` module (`formulas/BigbangFormula`) */
function bigbangFormulaRef(): BigbangFormula {
  return bigbangFormula as unknown as BigbangFormula
}

/**
 * `Sidect` (`js/ui/sidect.js`, now `src/ui/sidecontent/SideContentFacade.ts`): the
 * side dialogs of the page. 
 */

/**
 * `cameraControls` (`js/camera/cameraControls.js`) as this application uses it.
 */
interface FreefallCameraControls {
  state: number
  target: Object3D
  timelineHeight: number
  timelineWidth: number
  boundingBoxes: TimescrollBBox[] | null
  IDLE: number
  VISUALIZER_RANDOM: number
  VISUALIZER_SPHERE: number
  VISUALIZER_WAVES: number
  TIMELINE_FLAT: number
  update(): void
  setState(state: number): void
  cameraGoto(
    position: Vector3,
    duration?: number,
    onComplete?: (() => void) | null,
    onUpdate?: (() => void) | null,
    ease?: string,
  ): void
  initFromUrl(url: string, duration?: number): void
}

/**
 * `atlas` is created by `js/main.js` (`atlas = new Atlas(params)`); it is the
 * ported `Atlas` class published as a global, so the cast only restores the type.
 */
function atlasRef(): Atlas {
  return atlasInstance() as unknown as Atlas
}

/** `Main.enableUI` */
function enableUI(): void {
  mainEnableUI()
}

/** `Main.animate` */
function animate(): void {
  mainAnimate()
}

/** legacy global owned by js/camera/cameraControls.js */
function cameraControlsRef(): FreefallCameraControls {
  return legacyCameraControls() as unknown as FreefallCameraControls
}

/**
 * The ported `Timescroll` is a class expression behind an `export const`, so its
 * instance type has to be derived with `InstanceType`.
 */
type TimescrollInstance = InstanceType<typeof Timescroll>

/** `camera` is created by `initTHREE` in `js/main.js`. */
function cameraRef(): PerspectiveCamera {
  return legacyCamera() as unknown as PerspectiveCamera
}

export class App {
  //synchronize pictures LOD every N millissecond ( default 1 second )
  callbackInterval = -1
  cameraControls: FreefallCameraControls
  timelineOn = false
  isIntro = true
  prevSeq: string | null = null
  chapters = {
    currentColor: new Color(0xff0000),
  }

  /**
   * The identifier of the chapter: never assigned, neither here nor by
   * `js/main.js` (kept for parity with the original member).
   */
  id: string | undefined = undefined

  // assigned by `setup()`
  startScreenEl: Element | null
  sideContent: Sidect
  ui: ChapterUi
  onButtonsClick: (event?: Event) => void
  currentColor: string

  // assigned by `start()` / `initCameraCenter()`
  timescroll: TimescrollInstance
  timelineWidth: number
  itemsWithoutDate: string[]
  introAlreadyShown: boolean

  constructor(camera: PerspectiveCamera) {
    this.cameraControls = cameraControlsRef()

    // `camera` is unused by the original constructor too: it is passed by
    // `js/main.js` (`app = new App(camera)`) and kept here for signature parity.
    void camera
  }

  // App interface implementation
  setup(): void {
    this.startScreenEl = document.body.querySelector('.start-screen')
    this.startScreenEl.classList.remove('show')
    // extras
    this.sideContent = new Sidect()
    // ui
    this.ui = new ChapterUi()
    // nav
    this.onButtonsClick = this.sequenceBtnClick.bind(this)
    for (let i = 0; i < this.ui.buttons.length; i++) {
      this.ui.buttons[i].addEventListener('click', this.onButtonsClick, false)
    }
    // show header
    this.ui.showHeader()

    //legacy inherited from chapterControler www/js/apps/online/chapter_controler.js L303
    this.currentColor = window
      .getComputedStyle(this.ui.header_el, null)
      .getPropertyValue('background-color')

    const params = legacyParams()

    //if we have to show the intro
    if (!(params.initHash && params.initHash !== '')) {
      // //preloads the first asset
      introItem.init(atlasRef().getOldestAsset(), this.preloadFirstItem.bind(this))
    } else {
      getDates(this.start.bind(this))
      animate()
    }

    if (params.isBigWallVersion) this.sequenceBtnClick()
  }

  // App interface implementation
  initLoading(): void {
    // retrieve the DOM element
    this.startScreenEl = document.body.querySelector('.start-screen')
    this.startScreenEl.classList.add('show')
  }

  /** Used as the `introItem.init` ready callback: its `e` argument is ignored. */
  preloadFirstItem(e?: unknown): void {
    void e

    // start load
    getDates(this.start.bind(this))

    // start the main update loop
    animate()
  }

  sequenceBtnClick(e?: MouseEvent): void {
    let seq = 'random'
    if (e) {
      e.preventDefault()
      e.stopPropagation()
      // `currentTarget` is only typed as `EventTarget`; the listener is attached
      // to a nav button
      const button = e.currentTarget as HTMLElement
      this.ui.setButtonHighlight(button)
      seq = button.getAttribute('data-seq')
    }

    this.start(seq)
  }

  update(): void {
    const atlas = atlasRef()
    const cameraControls = this.cameraControls

    cameraControls.update()
    // update waves
    if (cameraControls.state == cameraControls.VISUALIZER_WAVES) {
      for (const mesh of atlas.meshes) {
        mesh.material.material.uniforms['wavesAmp'].value += 0.01
      }
      markRenderNeeded()
    }
  }

  isDirectSubValid(): boolean {
    const params = legacyParams()

    const validSubDirs = ['random', 'sphere', 'wave', 'timeline']
    return validSubDirs.indexOf(params.directSub) != -1
  }

  start(seq?: string | null): TimescrollInstance | void {
    const atlas = atlasRef()
    const cameraControls = cameraControlsRef()
    const params = legacyParams()

    enableUI()
    this.ui.hideFooterMapMenu()

    //switches to the sequence described in the URL
    if ((!seq || seq == '') && params.directSub && this.isDirectSubValid()) {
      seq = params.directSub
      this.isIntro = false
      this.ui.highlightButtonBySeqName(seq)
      this.ui.showNavs()
    }

    // show intro and skip intro if no seq has been provided

    //intro
    if (this.isIntro && (!seq || !this.isDirectSubValid()) && !params.isBigWallVersion) {
      legacyWindow().displayIntroItem = true
      this.resetUrl()
      this.showIntro()
      this.prevSeq = null
      //fades in the first item

      setTimeout(introItem.start, 1000)

      return
    }

    if (params.isBigWallVersion && this.isIntro) {
      this.isIntro = false
      seq = 'random'
    }

    legacyWindow().displayIntroItem = false

    // console.log("start ! " + this.prevSeq + " _ " + seq + " _ " + params.initHash);

    // big bang explosion
    if (this.prevSeq == null && seq == 'random' && !(params.initHash && params.initHash !== '')) {
      // console.log(' ---- intro anim');
      this.ui.highlightButtonBySeqName(seq)
      this.ui.showNavs()
      this.prevSeq = seq // must be before introAnimation in order not to deadloop
      this.introAnimation()
      this.pushUrl(seq)
      return
    }

    this.pushUrl(seq)

    let formula: SphereFormula | WaveFormula | undefined
    // waves transition
    let wavesAmp = 0
    switch (seq) {
      case 'random': {
        // the original passed the raw `params.initHash && params.initHash !== ''`
        // expression, i.e. a string when a hash was present (the not-yet-ported
        // formula only tests it for truthiness)
        const commit = params.initHash && params.initHash !== ''
        bigbangFormulaRef().apply(atlas.assets, commit)
        dateLabels.hide(0.5)
        break
      }

      case 'sphere': {
        cameraControls.setState(cameraControls.VISUALIZER_SPHERE)
        formula = new SphereFormula()
        formula.apply(atlas.assets)
        // // reset color
        new ColorFormula(new Color(1, 1, 1)).apply(atlas.assets)

        dateLabels.hide(3)
        break
      }

      case 'wave': {
        wavesAmp = 1
        cameraControls.setState(cameraControls.VISUALIZER_WAVES)
        formula = new WaveFormula()
        // // reset color
        new ColorFormula(new Color(1, 1, 1)).apply(atlas.assets)

        formula.apply(atlas.assets)
        dateLabels.hide(3)
        break
      }

      case 'timeline': {
        this.timelineOn = true
        if (!this.timescroll) {
          this.timescroll = new Timescroll(atlas.assets)
          this.timescroll.setup((itemsWithoutDate) => {
            this.startScrollNoDatesItems(itemsWithoutDate, seq)
          })
        } else {
          this.initCameraCenter()
        }
        // trivia ---
        this.ui.showFooterMapMenu()
        return this.timescroll // RETURN
      }
    }

    //sets the waves motion amplitude
    atlas.meshes.forEach(function (mesh) {
      gsap.to(mesh.material.material.uniforms['wavesAmp'], {
        duration: 4,
        value: wavesAmp,
        onUpdate: function () {
          markRenderNeeded()
        },
      })
    })

    //deeplink
    if (params.initHash && params.initHash !== '') {
      atlas.skipAnimation()
      cameraControls.initFromUrl(params.initHash, 0)
      params.initHash = ''
    } else {
      // set camera destination
      if (seq == null || seq != 'random') {
        cameraControls.cameraGoto(new Vector3(0, 0, 30000), 2)
      }
    }
  }

  introAnimation(): void {
    const atlas = atlasRef()
    const cameraControls = cameraControlsRef()

    // show header
    this.ui.showNavs()

    // hide intro text();
    this.hideIntroText()

    // play animation
    const mdl = atlas.mdLabels.labels[0]
    // the original called `mdl.fadeOut( 2 )`; the ported `MetadataLabel.fadeOut`
    // takes no argument (its duration is hardcoded to 0.6s), so it was dropped
    if (mdl) mdl.fadeOut()
    setTimeout(() => {
      const duration = 3
      cameraControls.cameraGoto(
        new Vector3(0, 0, 10000),
        duration,
        () => {
          // console.log( "random tween over");
          //fixes the oldest item's posiiton
          for (let i = 0, l = atlas.assets.length; i < l; i++) {
            atlas.assets[i].setPosition(
              PRNG.random() * 2 - 1,
              8 + (Math.random() * 2 - 1),
              -10 - i * 0.1,
            )
            atlas.assets[i].setColor(1, 1, 1)
          }
          atlas.skipAnimation()

          // apply random formula
          cameraControls.setState(cameraControls.VISUALIZER_RANDOM)
          // `y` / `z` are omitted, as in the original: the `polar` mode of the
          // formula only reads `amp.x` (hence the assertion on the amplitude)
          const formula = new RandomFormula({ x: 7500 } as RandomFormulaAmplitude, 'polar', false)
          formula.apply(atlas.assets)

          const oldestAsset = atlas.getOldestAsset()
          oldestAsset.setPosition(0, 0, 0)

          const camera = cameraRef()
          cameraControls.cameraGoto(new Vector3(camera.position.x, camera.position.y, 1000), 3)
        },
        null,
        'expo.in',
      )

      //make the berekhat ram disappear
      setTimeout(introItem.stop, duration * 1000 - 500, 2)
    }, 1000)
  }

  showIntro(): void {
    this.isIntro = false
    // hide header
    this.ui.hideNavs()
    // show intro
    this.showIntroText()
    this.showIntroDistribution()
  }

  showIntroText(): void {
    // retrieve the DOM element
    const startScreenEl = document.body.querySelector('.intro-start-screen')
    startScreenEl.classList.add('show')

    // wait for click event on start button
    const btn = startScreenEl.querySelector('.start-btn')
    btn.addEventListener(
      'click',
      () => {
        this.start('random')
      },
      false,
    )
    btn.classList.add('show')

    // make sure we don't show this screen later on (eg: when clearing search)
    this.introAlreadyShown = true
  }

  //distributes the assets to thier default location
  showIntroDistribution(): void {
    const atlas = atlasRef()
    const cameraControls = cameraControlsRef()

    // show only oldest animation
    const oldestAsset = atlas.getOldestAsset()
    if (oldestAsset) {
      //hides all assets
      PRNG.setSeed(0)
      for (let i = 0, l = atlas.assets.length; i < l; i++) {
        atlas.assets[i].setPosition(
          (PRNG.random() * 2 - 1) * 100000,
          10000, //( Math.random()*2 - 1 ) * 5000,
          (PRNG.random() * 2 - 1) * 100000,
        )
        atlas.assets[i].setColor(0, 0, 0)
      }
      // jump into position
      atlas.skipAnimation()

      //sets the oldestAsset in position
      const h = oldestAsset.sizeNorm.w

      cameraControls.setState(cameraControls.IDLE)

      cameraControls.target.position.copy(oldestAsset.position) //( 0 ,h * .5, 0 );
      const camera = cameraRef()
      camera.position.set(-h * 1.5, h * 0.5, 60)
      // LATENT BUG fixed: the original read `camera.lookAt(cameraControls.target)`,
      // i.e. it passed the `Object3D` instead of its `Vector3` position (three
      // reads `x`/`y`/`z` off the argument, so the camera quaternion became NaN).
      // Every other call site of the project uses `target.position`.
      camera.lookAt(cameraControls.target.position)
    }
  }

  hideIntroText(): void {
    // retrieve the DOM element
    const startScreenEl = document.body.querySelector('.intro-start-screen')
    startScreenEl.classList.remove('show')
  }

  // TIMELINE ----------------------------------------------

  startScrollNoDatesItems(
    itemsWithoutDate: string[],
    seq?: string | null,
    initialisedCamera?: boolean,
  ): void {
    // `seq` and `initialisedCamera` are unused by the original body (kept for
    // signature parity, `Timescroll.setup` only passes the first argument)
    void seq
    void initialisedCamera

    this.timelineWidth = 0
    this.itemsWithoutDate = itemsWithoutDate
    this.initCameraCenter()
  }

  initCameraCenter(): void {
    const atlas = atlasRef()
    const cameraControls = cameraControlsRef()

    new ColorFormula(new Color(1, 1, 1)).apply(atlas.assets)

    //sets the waves motion amplitude
    atlas.meshes.forEach(function (mesh) {
      gsap.to(mesh.material.material.uniforms['wavesAmp'], {
        duration: 4,
        value: 0,
        onUpdate: function () {
          markRenderNeeded()
        },
      })
    })

    this.timescroll.layout()
    this.hideItemsNoData(this.itemsWithoutDate)

    // console.log( "timeline.initCameraCenter" );
    cameraControls.timelineHeight = this.timescroll.timelineHeight
    cameraControls.timelineWidth = this.timescroll.getWidth()
    cameraControls.boundingBoxes = this.timescroll.bboxes

    dateLabels.show(3)

    cameraControls.setState(cameraControls.TIMELINE_FLAT)

    const year = 0

    timelineControls.setFirstLocation(this.timescroll, year)
  }

  hideItemsNoData(itemsNoData: string[]): void {
    const atlas = atlasRef()

    if (!itemsNoData || itemsNoData.length == 0) return
    const assetsNoDates = atlas.getAssetsFromIds(itemsNoData)
    //new ResetFormula().apply(assetsNoDates);
    new ColorFormula(new Color(0, 0, 0)).apply(assetsNoDates)
    // `y` / `z` are omitted, as in the original (only `amp.x` is read)
    new RandomFormula({ x: 6000 } as RandomFormulaAmplitude, 'polar', false, 10000).apply(
      assetsNoDates,
    )
  }

  ////////// HISTORY

  pushUrl(seq?: string | null): void {
    if (seq == null || seq == '') return

    const href = getCurrentUrl()
    if (href.lastIndexOf(seq) == -1) {
      const bits = href.split('/')
      bits.pop()
      const id = bits.join('/') + '/' + seq

      // console.log( "PUSH URL", id );
      history.pushState(id, null, id)
    }
  }

  resetUrl(): void {
    const params = legacyParams()

    params.directSub = ''
    params.initHash = ''
    const href = getCurrentUrl()
    const bits = href.split('freefall/')
    bits.pop()
    const id = bits.join('/') + 'freefall/'
    history.pushState(id, null, id)
    // console.log( "RESET URL", id );
  }
}

// GO --------------------------------------
/**
 * Engine bootstrap. This was the LAST statement of `js/apps/app_freefall.js`
 * (`setup(window.innerWidth, window.innerHeight);`), evaluated as soon as the
 * classic script ran — i.e. after every file of the load order had been loaded,
 * since `apps/app_freefall.js` was the last entry of `js/freefall.js`.
 *
 * It must not run at import time any more: the engine loader calls
 * `bootFreefall()` once, after all the ported modules have been installed
 * (`Main` exports `setup`).
 */
export function bootFreefall(): void {
  mainSetup(window.innerWidth, window.innerHeight)
}
