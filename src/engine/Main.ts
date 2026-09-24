import { Color, PerspectiveCamera, Scene, Vector2 } from 'three'
import { TweenLite, legacyEases } from '../legacy/gsapLegacy'
import { publishGlobals } from '../legacy/publishGlobals'
import { LegacyWebGLRenderer } from '../legacy/threeLegacyCompat'
import { Atlas } from './atlas/Atlas'
import { lod } from './atlas/lod/lod'
import { clickManager } from './camera/ClickManager'
import { bigbangFormula } from './formulas/BigbangFormula'
import { getQueryParams } from './utils/dom'

/**
 * Ported from `js/main.js`.
 *
 * Engine bootstrap of the freefall experiment: the page parameters, the three.js
 * objects, the preloader of the static atlases, the render loop and the window
 * resize handling.
 *
 * Port notes:
 * - the mutable top level primitives of the original (`renderNeeded`, `lockLOD`,
 *   `hideMetadata`, `displayIntroItem`, `disableCameraControls`,
 *   `geometryTweening`, `rendererWidth` / `rendererHeight`, `windowWidth` /
 *   `windowHeight`, the `numAssets*` counters, `preloadInterval`,
 *   `mouseWheelDeltaFactor*`, `currentUrl`, `hash`, `camHash`) stay on `window`
 *   and are read / written through the single typed `shared` view declared below.
 *   They must not become private module variables: `src/engine/legacyScope.ts`,
 *   `atlas/Metadatas.ts`, `camera/controls/*.ts` and the classic scripts read and
 *   write them by name, so a module local copy would fall out of sync (publishing
 *   a snapshot through `publishGlobals` would break that sharing the same way).
 * - `siteBaseUrl` and `resizeHCenteredElems` are part of this module's public API
 *   as well, so their `window` property is an accessor over the module variable
 *   (see `mirrorOnWindow`): live in both directions, and the exports keep working
 *   for the modules that import them.
 * - the objects (`camera`, `scene`, `renderer`, `app`, `atlas`, `params`) are
 *   module variables that are published on `window` when they are created /
 *   assigned, because `Object.assign` copies the current *value*: every
 *   assignment publishes again.
 * - `setup(width, height)` used to be called by the last script of the original
 *   build block (`js/apps/app_freefall.js`, bottom line) and starts the app
 *   (`new App(camera)`, preload, `animate()`). It is only exported and published
 *   here, never called at import time: the caller (the port of `app_freefall.js`)
 *   invokes it through `window.setup`.
 * - `App` is still the classic global of `js/apps/app_freefall.js` (a parallel port
 *   is expected to publish it as `window.App`), read at call time like the classic
 *   script did.
 * - the legacy `parseInt(<number>, 10)` calls become `parseInt(String(<number>), 10)`:
 *   `parseInt` requires a string and the implicit conversion it used to do is kept.
 * - `window.location = <url>` became `window.location.href = <url>`: the DOM types
 *   only allow assigning a `Location`, the behaviour is the same.
 * - BUGFIX: the array of `.h-recenter` elements is typed as `NodeListOf<HTMLElement>`
 *   (`querySelectorAll<HTMLElement>`): the original read `.style` / `.offsetHeight`
 *   on `Element`s that the CMS markup guarantees to be elements anyway.
 * - `setupRemote` and `paramsBigwall` are the hooks of the original embed pages and
 *   are declared ambiently below: the `typeof ... == "function"` guards keep
 *   working exactly like they did in the classic script.
 */

/* ------------------------------------------------------------------------- *
 * Global state of the legacy engine (the top level `var`s of `js/main.js`).
 * ------------------------------------------------------------------------- */

/**
 * The mutable primitives `js/main.js` declared as globals: their state lives on
 * `window`, this module only reads / writes them through this view.
 */
export interface MainGlobals {
  /** global flag that can be set true to render */
  renderNeeded: boolean
  /** hides the labels for the freefall intro */
  hideMetadata: boolean
  /** hides the links of the label of the first item of the freefall intro (set in app_freefall) */
  displayIntroItem: boolean
  /** global variable to prevent LOD from loading */
  lockLOD: boolean
  disableCameraControls: boolean
  geometryTweening: boolean
  /** undefined until `initTHREE` runs (the original declared them bare) */
  rendererWidth: number
  rendererHeight: number
  windowWidth: number
  windowHeight: number
  // utils for preloader
  numAssetsLoaded: number
  numAssetsLoadedDisplay: number
  /** `numAssetsFormated`, declared alongside `numAssetsLoadedDisplay` in the original */
  numAssetsFormated: number
  numAssetsTotal: number
  numPartners: number
  preloadInterval: number
  mouseWheelDeltaFactor: number
  mouseWheelDeltaFactorOrbit: number
  mouseWheelDeltaFactor_default: number
  mouseWheelDeltaFactor_defaultOrbit: number
  mouseWheelDeltaFactor_freefall: number
  mouseWheelDeltaFactor_tsne_max: number
  mouseWheelDeltaFactor_tsne_min: number
  currentUrl: string
  hash: string
  camHash: string
  /** mirrored from the module binding below (see `mirrorOnWindow`) */
  siteBaseUrl: string
  /** mirrored from the module binding below (see `mirrorOnWindow`) */
  resizeHCenteredElems: NodeListOf<HTMLElement>
}

const shared = window as unknown as MainGlobals

/**
 * Hooks of the original embed pages. They were referenced by bare name in
 * `js/main.js` and never defined in this snapshot: declared (ambient, no emitted
 * code) so the `typeof` guards below still compile and behave the same.
 */
declare const setupRemote: (() => void) | undefined
declare const paramsBigwall: (() => void) | undefined

/* ------------------------------------------------------------------------- *
 * The objects of the engine. They are published on `window` where they are
 * created, because the classic scripts and the ported modules read them there.
 * ------------------------------------------------------------------------- */

export let camera: PerspectiveCamera
export let scene: Scene
export let renderer: LegacyWebGLRenderer

// global flag that can be set true to render
shared.renderNeeded = true

/** the application object, built by `setup` (`window.App`) */
export let app: FreefallApp
/** the atlas, built by `appStart` */
export let atlas: Atlas

//global variable to prevent LOD from loading
shared.lockLOD = false

// hides the labels for the freefall intro
shared.hideMetadata = false
// hides the links of the label of the first item of the freefall intro (set in app_freefall )
shared.displayIntroItem = false

/** never assigned in the original either: dead global kept 1:1 */
export let control: unknown

// setup with provided "application"
// it should be an object containing logic for items layouts (aka formulas),
// the camera controls and UI elements.
// it also has to implement a few methods (see below)

shared.disableCameraControls = false

/** the `.h-recenter` elements `updateHCenteredPosition` repositions (set in `setup`) */
export let resizeHCenteredElems: NodeListOf<HTMLElement>

shared.windowWidth = window.innerWidth
shared.windowHeight = window.innerHeight
// `rendererWidth` / `rendererHeight` are declared without initialiser in the
// original (`undefined` until `initTHREE` runs) and are left unassigned here too.

// utils for preloader
shared.numAssetsLoaded = 0
shared.numAssetsLoadedDisplay = 0
shared.numAssetsFormated = 0
shared.numAssetsTotal = 0
shared.numPartners = 0
shared.preloadInterval = -1

shared.mouseWheelDeltaFactor_default = 1
shared.mouseWheelDeltaFactor_defaultOrbit = 1
shared.mouseWheelDeltaFactor_freefall = 0.07
shared.mouseWheelDeltaFactor_tsne_max = 1.2
shared.mouseWheelDeltaFactor_tsne_min = 0.3

shared.mouseWheelDeltaFactor = shared.mouseWheelDeltaFactor_default
shared.mouseWheelDeltaFactorOrbit = shared.mouseWheelDeltaFactor_defaultOrbit

shared.currentUrl = ''

export let siteBaseUrl = 'https://artsexperiments.withgoogle.com/'

/**
 * Keeps a module binding and its `window` property the same slot: the getter /
 * setter are installed once, so classic scripts assigning `window.siteBaseUrl`
 * update the exported binding and vice versa (a `publishGlobals` snapshot would
 * freeze at the value of the moment).
 *
 * The accessors read / write the module binding directly on purpose: the module
 * binding and `window[name]` are the same variable and `shared[name]` would call
 * the accessor again.
 */
function mirrorOnWindow(
  name: 'siteBaseUrl' | 'resizeHCenteredElems',
  accessors: { get(): unknown; set(value: unknown): void },
): void {
  Object.defineProperty(window, name, {
    configurable: true,
    enumerable: true,
    get: accessors.get,
    set: accessors.set,
  })
}

mirrorOnWindow('siteBaseUrl', {
  get: () => siteBaseUrl,
  set: (value) => {
    siteBaseUrl = value as string
  },
})

mirrorOnWindow('resizeHCenteredElems', {
  get: () => resizeHCenteredElems,
  set: (value) => {
    resizeHCenteredElems = value as NodeListOf<HTMLElement>
  },
})

/* ------------------------------------------------------------------------- *
 * The application object (`js/apps/app_freefall.js`), whose constructor is
 * still a classic global.
 * ------------------------------------------------------------------------- */

/** The members of the application object `js/main.js` drives. */
interface FreefallApp {
  ui?: { resize(): void; stopLoading(): void; startLoading(): void }
  editorPanel?: {
    opened: boolean
    width: number
    xp_container?: HTMLElement
    getWidth(): number
  }
  initLoading?(): void
  preloadContent?(callback: () => void): void
  resize?(): void
  update(): void
  setup(): void
}

/** `App` — `js/apps/app_freefall.js`, read at call time like the classic global was. */
function AppConstructor(): new (camera: PerspectiveCamera) => FreefallApp {
  return (window as unknown as { App: new (camera: PerspectiveCamera) => FreefallApp }).App
}

/** `cameraControls` — `js/camera/cameraControls.js`, read at call time. */
interface MainCameraControls {
  init(): void
  state: number
  VISUALIZER_WAVES: number
}

function cameraControls(): MainCameraControls {
  return (window as unknown as { cameraControls: MainCameraControls }).cameraControls
}

/* ------------------------------------------------------------------------- *
 * The engine, in the original statement order.
 * ------------------------------------------------------------------------- */

export function appStart(): void {
  // setup the atlas
  atlas = new Atlas(params)
  // `atlas.js` and the application read it from the global scope
  publishGlobals({ atlas })

  //setup the controls
  cameraControls().init()

  scene.add(atlas.container)

  const mainpreloader = document.querySelector('.main-preloader')
  shared.numAssetsTotal = parseInt(mainpreloader.getAttribute('data-items'), 10)
  shared.numPartners = parseInt(mainpreloader.getAttribute('data-partners'), 10)

  updateHCenteredPosition()

  if (typeof app.initLoading !== 'undefined') app.initLoading()

  TweenLite.to(document.querySelector('.main-preloader span'), 0.7, {
    ease: legacyEases.Linear.easeNone,
    alpha: 1,
    delay: 1,
  })

  atlas.loadAllStatics(params, onAtlasLoadComplete, onAtlasLoadProgress)

  // start update loop for preloader
  // (`setInterval` is typed `Timeout` as soon as `@types/node` is in the program;
  // the legacy global held the browser handle, which `clearInterval` takes back)
  shared.preloadInterval = setInterval(updateLoader, 30) as unknown as number
}

export function updateLoader(): void {
  // the original assumed the preloader is in the page (it is, until `goSetup`)
  const preloader_el = document.querySelector('.main-preloader > p') as HTMLElement
  // retrieve total number of assets loaded
  shared.numAssetsLoadedDisplay += (shared.numAssetsLoaded - shared.numAssetsLoadedDisplay) * 0.1
  // add commas between thousands
  shared.numAssetsFormated = Math.floor(shared.numAssetsLoadedDisplay)
  // .toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // update dom element
  const pct = Math.floor(shared.numAssetsFormated / shared.numAssetsTotal * 100)
  preloader_el.innerHTML = pct + '%'
}

export function onAtlasLoadProgress(pct: number): void {
  shared.numAssetsLoaded = pct * shared.numAssetsTotal
}

export function goSetup(): void {
  // remove preloader
  const preloader_el = document.querySelector('.main-preloader')
  preloader_el.parentNode.removeChild(preloader_el)
  // setup the application
  app.setup()

  if (typeof setupRemote == 'function') setupRemote()
}

/** `pct` is unused in the original as well: the atlas invokes this with no argument. */
export function onAtlasLoadComplete(pct?: number): void {
  shared.numAssetsLoadedDisplay = shared.numAssetsLoaded
  updateLoader()
  clearInterval(shared.preloadInterval)

  //var preloader_el = document.querySelector('.main-preloader > p');
  //TweenLite.to(preloader_el, 0.8, {alpha:0, ease:Linear.easeNone});

  // delay app launch so that the browser refreshes with latest infos before
  // the short freeze
  setTimeout(function () {
    if (typeof app.preloadContent !== 'undefined') app.preloadContent(goSetup)
    else goSetup()
  }, 10)
}

shared.geometryTweening = false

export function checkTweenInterval(): void {
  if (atlas.getTransitionPct() < 1) {
    if (!shared.geometryTweening) {
      // console.log( "clear once")
      shared.geometryTweening = true
      lod.clear()
    }
    // console.log( "tweening", geometryTweening, atlas.getTransitionPct() );
  } else {
    shared.geometryTweening = false
  }
}

export function setup(width: number, height: number): void {
  checkParams()

  shared.siteBaseUrl += params.directChapter

  const supportsWebGL = (function () {
    try {
      return (
        !!window.WebGLRenderingContext &&
        !!document.createElement('canvas').getContext('experimental-webgl')
      )
    } catch (e) {
      return false
    }
  })()
  if (!supportsWebGL) {
    window.location.href = shared.siteBaseUrl + '/not-supported'
    return
  }

  // init threejs base items
  initTHREE(width, height)
  const App = AppConstructor()
  app = new App(camera)
  // the application and `atlas.js` read `app` from the global scope
  publishGlobals({ app })

  const container = document.getElementsByClassName('cilex-content')[0]
  container.appendChild(renderer.domElement)
  //document.body.appendChild(renderer.domElement);
  shared.resizeHCenteredElems = document.querySelectorAll<HTMLElement>('.h-recenter')
  window.addEventListener('resize', onWindowResize, false)

  appStart()

  setInterval(function () {
    if (
      shared.geometryTweening ||
      shared.displayIntroItem ||
      shared.disableCameraControls ||
      cameraControls().state == cameraControls().VISUALIZER_WAVES
    )
      return
    // console.log( "setFromCamera" );

    lod.setFromCamera()
  }, 1500)
}

export function checkParams(): void {
  let directChapter = ''
  let directSub = ''

  if (params.directChapter && params.directChapter !== '') directChapter = params.directChapter

  if (!directChapter.match(/^[a-z\-]+$/)) directChapter = ''

  if (params.directSub && params.directSub !== '' && directChapter !== '')
    directSub = params.directSub

  if (directSub.match(/[|;$%@"'<>?()/:=.+,]/g)) directSub = ''

  params.directChapter = directChapter
  params.directSub = directSub

  // define background color from chapter name
  if (directChapter == 'curatortable') {
    params.clearColor = 0xd7d7d7
  } else if (directChapter == 'tsnemap') {
    params.clearColor = 0xffffff
  } else {
    params.clearColor = 0
  }

  if (typeof paramsBigwall == 'function') paramsBigwall()
}

export function initTHREE(width: number, height: number): LegacyWebGLRenderer {
  camera = new PerspectiveCamera(30, width / height, 1, 100000)
  scene = new Scene()

  // `LegacyWebGLRenderer` is the npm renderer with the legacy no-argument
  // `getSize()` restored (see `src/legacy/threeLegacyCompat.ts`): `onWindowResize`
  // calls it without a target, exactly like `js/main.js` did.
  renderer = new LegacyWebGLRenderer({
    logarithmicDepthBuffer: true,
    // alpha: true
    //antialias:true
  })
  renderer.setPixelRatio(window.devicePixelRatio)

  // publish before `clickManager.init` (and any other reader) runs
  publishGlobals({ camera, scene, renderer })

  // directly show correct background color
  const c = new Color(params.clearColor)
  renderer.setClearColor(c)

  renderer.setSize(width, height)
  clickManager.init(width, height)
  shared.rendererWidth = width
  shared.rendererHeight = height

  // render once to make sure we have the correct background color
  renderer.render(scene, camera)
  return renderer
}

/** `event` is unused in the original as well. */
export function onWindowResize(event: Event): void {
  let panelOffset = 0
  if (app.editorPanel) {
    panelOffset = app.editorPanel.getWidth() - app.editorPanel.width
  }

  shared.windowWidth = window.innerWidth - panelOffset
  shared.windowHeight = window.innerHeight
  renderer.setSize(shared.windowWidth, shared.windowHeight)

  if (app.editorPanel && app.editorPanel.xp_container) {
    app.editorPanel.xp_container.style.left = parseInt(String(0.5 + panelOffset), 10) + 'px'
    app.editorPanel.xp_container.style.width = shared.windowWidth + 'px'
  }

  // three's current `getSize(target)` needs a target; the legacy renderer fills
  // and returns the vector it is given, so this is the original call
  const r = new Vector2()
  renderer.getSize(r)
  shared.rendererWidth = r.width
  shared.rendererHeight = r.height
  clickManager.setSize(r.width, r.height)
  camera.aspect = r.width / r.height
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)

  updateHCenteredPosition()

  if (app.ui) app.ui.resize()

  if (app && typeof app.resize == 'function') app.resize()
}

export function updateHCenteredPosition(): void {
  for (let i = 0; i < shared.resizeHCenteredElems.length; i++)
    shared.resizeHCenteredElems[i].style.top =
      parseInt(
        String(
          window.innerHeight * 0.5 - shared.resizeHCenteredElems[i].offsetHeight * 0.5,
        ),
        10,
      ) + 'px'
}

export function animate(): void {
  //check if geometry is tweening
  checkTweenInterval()

  // console.clear();
  requestAnimationFrame(animate)
  app.update()
  atlas.update()
  if (shared.renderNeeded) {
    // console.log( renderNeeded, cameraControls.info() );
    // console.time( "render" );
    renderer.render(scene, camera)
    // console.timeEnd( "render" );
    shared.renderNeeded = false
  }
}

//- global methods
export function enableUI(): void {
  app.ui.stopLoading()
  shared.disableCameraControls = false
  //cameraControls.orbitControls.enabled = true;
  //cameraControls.trackball.enabled = true;
}

export function disableUI(): void {
  app.ui.startLoading()
  shared.disableCameraControls = true
  //cameraControls.orbitControls.enabled = false;
  //cameraControls.trackball.enabled = false;
}

export function updateUrl(chapter: string, sub: string): void {
  shared.currentUrl = shared.siteBaseUrl + chapter + '/' + sub
}

//-----------------------------------------
// START ----------------------------------
//-----------------------------------------

shared.hash = window.location.hash.replace('#', '')
shared.camHash = shared.hash.match(/^[0-9.,a-zA-Z-_]+$/) ? shared.hash : ''

// The original page was embedded with its configuration in the query string.
// Standalone (for example with the generated mock data) missing/NaN values used
// to break the atlas queue, which never completes when `numAtlasMax` is NaN.
export function getQueryParamInt(name: string, fallback: number): number {
  const value = parseInt(getQueryParams(name), 10)
  return isNaN(value) ? fallback : value
}

/** The page parameters (`js/main.js` `params`), also read by every ported module. */
export interface MainParams {
  /** never read: the original passed the query string lookup as a comment */
  showDebug: boolean
  // static atlases configuration (do not apply to LOD)
  // num of atlases to load : 0 to 10
  numAtlasMax: number
  // size of thumbnails : 16, 32 or 64
  assetSize: number
  // max number of assets to load per atlas
  maxAssetPerAtlas: number
  // int to navigate directly to a specific scene / sequence
  startScene: number
  startSequence: number
  // set to begin the app with a search
  directChapter: string | null
  directSub: string | null
  initHash: string
  isMobile: boolean
  /** set by `checkParams` */
  clearColor?: number
  /** read by `lod.init` and `app_freefall.js` when the page is embedded */
  isBigWallVersion?: boolean
  [key: string]: unknown
}

export const params: MainParams = {
  showDebug: true, //getQueryParams('showDebug'),
  // static atlases configuration (do not apply to LOD)
  // num of atlases to load : 0 to 10
  numAtlasMax: getQueryParamInt('maxTextures', 2),
  // size of thumbnails : 16, 32 or 64
  assetSize: getQueryParamInt('assetSize', 16),
  // max number of assets to load per atlas
  maxAssetPerAtlas: getQueryParamInt('limit', 0),

  // int to navigate directly to a specific scene / sequence
  startScene: getQueryParamInt('startScene', 0),
  startSequence: getQueryParamInt('startSequence', 0),

  // set to begin the app with a search
  directChapter: document.body.getAttribute('data-schapter'),
  directSub: document.body.getAttribute('data-sview'),
  initHash: shared.camHash,

  isMobile: document.body.classList.contains('mobile'),
}

// `params` is shared by reference: every reader gets this very object
publishGlobals({ params })

/* ------------------------------------------------------------------------- *
 * Publishing. The names below are the globals the remaining classic scripts
 * (`js/apps/app_freefall.js`, `js/camera/cameraControls.js`, `js/ui/*.js`) look
 * up. The objects and the primitives above are not listed: the objects are
 * published where they are assigned and the primitives already live on `window`.
 * ------------------------------------------------------------------------- */

publishGlobals({
  setup,
  initTHREE,
  animate,
  appStart,
  goSetup,
  onAtlasLoadComplete,
  onAtlasLoadProgress,
  updateLoader,
  checkParams,
  onWindowResize,
  enableUI,
  disableUI,
  updateHCenteredPosition,
  checkTweenInterval,
  getQueryParamInt,
  updateUrl,
  // the classic `js/camera/clickManager.js` global, now served by this port
  clickManager,
  // the other formulas are published by `src/engine/install.ts`, which cannot be
  // touched here: `js/apps/app_freefall.js` (and its port) reads `bigbangFormula`
  // from the global scope, so the bootstrap publishes it
  bigbangFormula,
})
