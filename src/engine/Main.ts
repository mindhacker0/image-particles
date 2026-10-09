import { gsap } from 'gsap'
import { Atlas } from './atlas/Atlas'
import { lod } from './atlas/lod/lod'
import { clickManager } from './camera/ClickManager'
import { cameraControls } from './camera/CameraControls'
import { App } from './apps/AppFreefall'
import { RendererEngine } from './RendererEngine'
import { getQueryParams } from './utils/dom'

/**
 * 自由落体引擎的启动与生命周期管理。
 * 负责页面参数、预加载流程、应用引导与窗口尺寸编排；
 * 渲染本身（相机 / 场景 / 渲染器 / 按需渲染循环）由 `RendererEngine` 类承担。
 */

/* ------------------------------------------------------------------------- *
 * 共享状态：各模块运行时访问同一对象，避免状态分裂。
 * ------------------------------------------------------------------------- */

/**
 * 引擎运行时的共享可变状态。
 *
 * 这里只放跨模块读写的标志与计数；渲染相关状态（相机、场景、渲染器、尺寸、
 * 按需渲染开关）由 `RendererEngine` 类持有，不再散落在全局。
 */
export interface MainGlobals {
  /** 播放片头时隐藏标签 */
  hideMetadata: boolean
  /** 隐藏片头首个条目标签中的链接（由 AppFreefall 设置） */
  displayIntroItem: boolean
  /** 置为 true 时阻止 LOD 加载 */
  lockLOD: boolean
  disableCameraControls: boolean
  geometryTweening: boolean
  /** 视口尺寸；渲染区域尺寸见 `RendererEngine.width` / `height` */
  windowWidth: number
  windowHeight: number
  // 预加载器计数器
  numAssetsLoaded: number
  numAssetsLoadedDisplay: number
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
}

/**
 * 共享引用状态：各个模块在运行时都访问同一个对象，避免状态分裂。
 */
export const shared: MainGlobals = {
  hideMetadata: false,
  displayIntroItem: false,
  lockLOD: false,
  disableCameraControls: false,
  geometryTweening: false,
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
  numAssetsLoaded: 0,
  numAssetsLoadedDisplay: 0,
  numAssetsFormated: 0,
  numAssetsTotal: 0,
  numPartners: 0,
  preloadInterval: -1,
  mouseWheelDeltaFactor: 1,
  mouseWheelDeltaFactorOrbit: 1,
  mouseWheelDeltaFactor_default: 1,
  mouseWheelDeltaFactor_defaultOrbit: 1,
  mouseWheelDeltaFactor_freefall: 0.07,
  mouseWheelDeltaFactor_tsne_max: 1.2,
  mouseWheelDeltaFactor_tsne_min: 0.3,
  currentUrl: '',
  hash: '',
  camHash: '',
}

/** 宿主页面（嵌入场景）可选注入的钩子。 */
declare const setupRemote: (() => void) | undefined
declare const paramsBigwall: (() => void) | undefined

/* ------------------------------------------------------------------------- *
 * 引擎核心对象：由 `Main` 创建并持有。
 * ------------------------------------------------------------------------- */

/** 渲染引擎（相机 / 场景 / 渲染器 / 按需渲染循环），由 `setup` 创建 */
export let renderEngine: RendererEngine

/** 应用对象，由 `setup` 创建 */
export let app: FreefallApp
/** 图集对象，由 `appStart` 创建 */
export let atlas: Atlas

export let siteBaseUrl = 'https://artsexperiments.withgoogle.com/'

/* ------------------------------------------------------------------------- *
 * 应用对象接口。
 * ------------------------------------------------------------------------- */

/**
 * `Main` 驱动应用对象用到的成员。
 * 应用需提供条目布局逻辑（公式）、相机控制和 UI 元素。
 */
interface FreefallApp {
  ui?: { resize(): void; stopLoading(): void; startLoading(): void }
  editorPanel?: {
    opened: boolean
    width: number
    xp_container?: HTMLElement
    getWidth(): number
  }
  preloadContent?(callback: () => void): void
  resize?(): void
  update(): void
  setup(): void
}

/* ------------------------------------------------------------------------- *
 * 引擎启动流程。
 * ------------------------------------------------------------------------- */

/** 创建图集与相机控制，并启动静态资源预加载。 */
export function appStart(): void {
  // 创建图集
  atlas = new Atlas(params)

  // 初始化相机控制
  cameraControls.init()

  renderEngine.scene.add(atlas.container)
  //指定加载的资源数量，之前是通过界面参数获取
  shared.numAssetsTotal = 512
  shared.numPartners = 128
  
  atlas.loadAllStatics(params, onAtlasLoadComplete, onAtlasLoadProgress)

  // 启动预加载进度刷新
  // （一旦程序包含 `@types/node`，`setInterval` 会被推断为 `Timeout`，
  // 因此断言为 number 以便 `clearInterval` 使用）
  shared.preloadInterval = setInterval(updateLoader, 30) as unknown as number
}

/** 刷新预加载进度显示。 */
export function updateLoader(): void {
  // 平滑逼近已加载资源数
  shared.numAssetsLoadedDisplay += (shared.numAssetsLoaded - shared.numAssetsLoadedDisplay) * 0.1
  // 取整
  shared.numAssetsFormated = Math.floor(shared.numAssetsLoadedDisplay)
  // 更新 DOM
  const pct = Math.floor(shared.numAssetsFormated / shared.numAssetsTotal * 100)
  // 预加载进度
  let preloader = pct + '%'
}

export function onAtlasLoadProgress(pct: number): void {
  shared.numAssetsLoaded = pct * shared.numAssetsTotal
}

export function goSetup(): void {
  // 启动应用
  app.setup()

  if (typeof setupRemote == 'function') setupRemote()
}

/** `pct` 未使用：图集调用时不传参数。 */
export function onAtlasLoadComplete(pct?: number): void {
  shared.numAssetsLoadedDisplay = shared.numAssetsLoaded
  updateLoader()
  clearInterval(shared.preloadInterval)

  // 延迟启动应用：先让浏览器完成刷新，避免随后的短暂卡顿
  setTimeout(function () {
    if (typeof app.preloadContent !== 'undefined') app.preloadContent(goSetup)
    else goSetup()
  }, 10)
}

/** 图集仍在过渡时清空一次 LOD（作为每帧回调注册）。 */
function checkTweenInterval(): void {
  if (atlas.getTransitionPct() < 1) {
    if (!shared.geometryTweening) {
      shared.geometryTweening = true
      lod.clear()
    }
  } else {
    shared.geometryTweening = false
  }
}

/**
 * 初始化引擎：检查参数与 WebGL 支持，创建渲染引擎与 `App`，
 * 并启动每帧更新与 LOD 定时刷新。
 */
export function setup(width: number, height: number): void {
  checkParams()

  siteBaseUrl += params.directChapter

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
    window.location.href = siteBaseUrl + '/not-supported'
    return
  }

  // 创建渲染引擎（相机 / 场景 / 渲染器）
  renderEngine = new RendererEngine({
    width,
    height,
    clearColor: params.clearColor as number,
  })
  clickManager.init(width, height)

  app = new App(renderEngine.camera)

  renderEngine.attachTo(document.getElementsByClassName('cilex-content')[0])
  window.addEventListener('resize', onWindowResize, false)

  // 每帧回调：检查 LOD 过渡，然后更新应用与图集
  renderEngine.onFrame(checkTweenInterval)
  renderEngine.onFrame(() => app.update())
  renderEngine.onFrame(() => atlas.update())

  appStart()

  setInterval(function () {
    if (
      shared.geometryTweening ||
      shared.displayIntroItem ||
      shared.disableCameraControls ||
      cameraControls.state == cameraControls.VISUALIZER_WAVES
    )
      return

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

  // 根据章节名设置背景色
  if (directChapter == 'curatortable') {
    params.clearColor = 0xd7d7d7
  } else if (directChapter == 'tsnemap') {
    params.clearColor = 0xffffff
  } else {
    params.clearColor = 0
  }

  if (typeof paramsBigwall == 'function') paramsBigwall()
}

/** 窗口尺寸变化时更新渲染器、相机与居中元素。`event` 未使用。 */
export function onWindowResize(event: Event): void {
  let panelOffset = 0
  if (app.editorPanel) {
    panelOffset = app.editorPanel.getWidth() - app.editorPanel.width
  }

  shared.windowWidth = window.innerWidth - panelOffset
  shared.windowHeight = window.innerHeight
  renderEngine.setSize(shared.windowWidth, shared.windowHeight)

  if (app.editorPanel && app.editorPanel.xp_container) {
    app.editorPanel.xp_container.style.left = parseInt(String(0.5 + panelOffset), 10) + 'px'
    app.editorPanel.xp_container.style.width = shared.windowWidth + 'px'
  }

  clickManager.setSize(renderEngine.width, renderEngine.height)
  renderEngine.render()

  if (app.ui) app.ui.resize()

  if (app && typeof app.resize == 'function') app.resize()
}

//- 全局方法
export function enableUI(): void {
  app.ui.stopLoading()
  shared.disableCameraControls = false
}

export function disableUI(): void {
  app.ui.startLoading()
  shared.disableCameraControls = true
}

export function updateUrl(chapter: string, sub: string): void {
  shared.currentUrl = siteBaseUrl + chapter + '/' + sub
}

//-----------------------------------------
// 启动 -----------------------------------
//-----------------------------------------

shared.hash = window.location.hash.replace('#', '')
shared.camHash = shared.hash.match(/^[0-9.,a-zA-Z-_]+$/) ? shared.hash : ''

// 页面配置原本来自查询字符串。独立运行（例如使用生成的模拟数据）时，
// 参数缺失或为 NaN 会让图集队列永不完成（`numAtlasMax` 为 NaN），
// 因此为各参数提供回退值。
export function getQueryParamInt(name: string, fallback: number): number {
  const value = parseInt(getQueryParams(name), 10)
  return isNaN(value) ? fallback : value
}

/** 页面参数，各模块都会读取。 */
export interface MainParams {
  /** 未使用：查询字符串取值被注释掉，固定为 true */
  showDebug: boolean
  // 静态图集配置（不适用于 LOD）
  // 要加载的图集数量：0 到 10
  numAtlasMax: number
  // 缩略图尺寸：16、32 或 64
  assetSize: number
  // 每个图集加载的最大资源数
  maxAssetPerAtlas: number
  // 直接跳转到指定场景/序列的索引
  startScene: number
  startSequence: number
  // 直接进入的章节 / 子视图（来自 data-schapter / data-sview）
  directChapter: string | null
  directSub: string | null
  initHash: string
  isMobile: boolean
  /** 由 `checkParams` 设置 */
  clearColor?: number
  /** 页面嵌入时的宽屏（Big Wall）版本标记 */
  isBigWallVersion?: boolean
  [key: string]: unknown
}

export const params: MainParams = {
  showDebug: true, // 原为 getQueryParams('showDebug')
  // 静态图集配置（不适用于 LOD）
  // 要加载的图集数量：0 到 10
  numAtlasMax: getQueryParamInt('maxTextures', 2),
  // 缩略图尺寸：16、32 或 64
  assetSize: getQueryParamInt('assetSize', 16),
  // 每个图集加载的最大资源数
  maxAssetPerAtlas: getQueryParamInt('limit', 0),

  // 直接跳转到指定场景/序列的索引
  startScene: getQueryParamInt('startScene', 0),
  startSequence: getQueryParamInt('startSequence', 0),

  // 直接进入的章节 / 子视图
  directChapter: document.body.getAttribute('data-schapter'),
  directSub: document.body.getAttribute('data-sview'),
  initHash: shared.camHash,

  isMobile: document.body.classList.contains('mobile'),
}
