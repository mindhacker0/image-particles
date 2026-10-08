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
 * 自由落体章节的主应用入口。
 * 负责页面状态切换、序列导航、相机过渡和时间线布局。
 */

/* ------------------------------------------------------------------------- *
 * 与应用其它模块共享的状态。
 * ------------------------------------------------------------------------- */

/**
 * 各模块共享的可变状态字段。
 */
interface LegacyWindowPrimitives {
  /** 为 true 时阻止 LOD 加载，由其它模块写入 */
  lockLOD: boolean
  /** 片头期间隐藏标签，由其它模块写入 */
  hideMetadata: boolean
  /**
   * 隐藏首个条目标签中的链接：由 `start()` 播放片头时设置，`Metadatas` 读取；
   * 为 true 时 `animate` 循环跳过 LOD 更新。
   */
  displayIntroItem: boolean
  /** 预加载计数器，由其它模块写入 */
  numAssetsLoaded: number
  numAssetsTotal: number
  numPartners: number
  /** 渲染器尺寸，由其它模块写入 */
  rendererWidth: number
  rendererHeight: number
  /** 滚轮系数，被 `cameraControls.setState` 重置 */
  mouseWheelDeltaFactor: number
  mouseWheelDeltaFactorOrbit: number
  /**
   * 为 true 时需要渲染一帧，通过 `markRenderNeeded()` 设置。
   */
  renderNeeded: boolean
}

function legacyWindow(): LegacyWindowPrimitives {
  return shared
}

/* ------------------------------------------------------------------------- *
 * 外部模块对象的访问包装。
 * ------------------------------------------------------------------------- */

/** 大爆炸公式接口。 */
interface BigbangFormula {
  /** `commit` 可能是布尔或 URL hash 字符串。 */
  apply(assets: Asset[], commit: boolean | string): void
}

/** 大爆炸公式模块。 */
function bigbangFormulaRef(): BigbangFormula {
  return bigbangFormula as unknown as BigbangFormula
}

/** 相机控制器接口。 */
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

/** 统一从 legacyScope 中读取 Atlas 实例。 */
function atlasRef(): Atlas {
  return atlasInstance() as unknown as Atlas
}

/** 公开的 UI 启用入口。 */
function enableUI(): void {
  mainEnableUI()
}

/** 公开的动画更新入口。 */
function animate(): void {
  mainAnimate()
}

/** 获取相机控制器实例。 */
function cameraControlsRef(): FreefallCameraControls {
  return legacyCameraControls() as unknown as FreefallCameraControls
}

/** `Timescroll` 的实例类型。 */
type TimescrollInstance = InstanceType<typeof Timescroll>

/** 获取当前相机实例。 */
function cameraRef(): PerspectiveCamera {
  return legacyCamera() as unknown as PerspectiveCamera
}

export class App {
  // 每隔 N 毫秒同步一次图片 LOD（默认 1 秒）
  callbackInterval = -1
  cameraControls: FreefallCameraControls
  timelineOn = false
  isIntro = true
  prevSeq: string | null = null
  chapters = {
    currentColor: new Color(0xff0000),
  }

  /** 章节标识：始终未赋值，仅为对齐接口保留。 */
  id: string | undefined = undefined

  // 由 `setup()` 赋值
  startScreenEl: Element | null
  sideContent: Sidect
  ui: ChapterUi
  onButtonsClick: (event?: Event) => void
  currentColor: string

  // 由 `start()` / `initCameraCenter()` 赋值
  timescroll: TimescrollInstance
  timelineWidth: number
  itemsWithoutDate: string[]
  introAlreadyShown: boolean

  constructor(camera: PerspectiveCamera) {
    this.cameraControls = cameraControlsRef()

    // `camera` 未被构造函数使用，仅为签名一致保留。
    void camera
  }

  /** 初始化界面与导航，并按是否存在深链接决定进入片头还是直接启动。 */
  // App 接口实现
  setup(): void {
    this.startScreenEl = document.body.querySelector('.start-screen')
    this.startScreenEl.classList.remove('show')
    // 附加模块
    this.sideContent = new Sidect()
    // 界面
    this.ui = new ChapterUi()
    // 导航
    this.onButtonsClick = this.sequenceBtnClick.bind(this)
    for (let i = 0; i < this.ui.buttons.length; i++) {
      this.ui.buttons[i].addEventListener('click', this.onButtonsClick, false)
    }
    // 显示头部
    this.ui.showHeader()

    // 以头部背景色作为章节配色
    this.currentColor = window
      .getComputedStyle(this.ui.header_el, null)
      .getPropertyValue('background-color')

    const params = legacyParams()

    // 需要时展示片头
    if (!(params.initHash && params.initHash !== '')) {
      // 预加载第一个资源
      introItem.init(atlasRef().getOldestAsset(), this.preloadFirstItem.bind(this))
    } else {
      getDates(this.start.bind(this))
      animate()
    }

    if (params.isBigWallVersion) this.sequenceBtnClick()
  }

  // App 接口实现
  initLoading(): void {
    // 获取 DOM 元素
    this.startScreenEl = document.body.querySelector('.start-screen')
    this.startScreenEl.classList.add('show')
  }

  /** 作为 `introItem.init` 的就绪回调，其 `e` 参数被忽略。 */
  preloadFirstItem(e?: unknown): void {
    void e

    // 开始加载
    getDates(this.start.bind(this))

    // 启动主更新循环
    animate()
  }

  sequenceBtnClick(e?: MouseEvent): void {
    let seq = 'random'
    if (e) {
      e.preventDefault()
      e.stopPropagation()
      // `currentTarget` 仅被类型化为 `EventTarget`，监听器实际挂在导航按钮上
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
    // 更新波浪动画
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

  /**
   * 状态机入口：根据序列在 random / sphere / wave / timeline 之间切换，
   * 并按需播放片头；`prevSeq` 与 `seq` 的差异决定过渡动画。
   */
  start(seq?: string | null): TimescrollInstance | void {
    const atlas = atlasRef()
    const cameraControls = cameraControlsRef()
    const params = legacyParams()

    enableUI()
    this.ui.hideFooterMapMenu()

    // 切换到 URL 指定的序列
    if ((!seq || seq == '') && params.directSub && this.isDirectSubValid()) {
      seq = params.directSub
      this.isIntro = false
      this.ui.highlightButtonBySeqName(seq)
      this.ui.showNavs()
    }

    // 未提供序列时展示片头并提前返回

    // 片头
    if (this.isIntro && (!seq || !this.isDirectSubValid()) && !params.isBigWallVersion) {
      legacyWindow().displayIntroItem = true
      this.resetUrl()
      this.showIntro()
      this.prevSeq = null
      // 淡入第一个条目

      setTimeout(introItem.start, 1000)

      return
    }

    if (params.isBigWallVersion && this.isIntro) {
      this.isIntro = false
      seq = 'random'
    }

    legacyWindow().displayIntroItem = false

    // 大爆炸动画：首次进入（prevSeq 为 null）且非深链接时的早退分支
    if (this.prevSeq == null && seq == 'random' && !(params.initHash && params.initHash !== '')) {
      this.ui.highlightButtonBySeqName(seq)
      this.ui.showNavs()
      this.prevSeq = seq // 必须在 introAnimation 之前赋值，否则会死循环
      this.introAnimation()
      this.pushUrl(seq)
      return
    }

    this.pushUrl(seq)

    let formula: SphereFormula | WaveFormula | undefined
    // 波浪过渡振幅
    let wavesAmp = 0
    switch (seq) {
      case 'random': {
        // 大爆炸公式只判断真值，布尔值或字符串均可
        const commit = params.initHash && params.initHash !== ''
        bigbangFormulaRef().apply(atlas.assets, commit)
        dateLabels.hide(0.5)
        break
      }

      case 'sphere': {
        cameraControls.setState(cameraControls.VISUALIZER_SPHERE)
        formula = new SphereFormula()
        formula.apply(atlas.assets)
        // 复位颜色
        new ColorFormula(new Color(1, 1, 1)).apply(atlas.assets)

        dateLabels.hide(3)
        break
      }

      case 'wave': {
        wavesAmp = 1
        cameraControls.setState(cameraControls.VISUALIZER_WAVES)
        formula = new WaveFormula()
        // 复位颜色
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
        this.ui.showFooterMapMenu()
        return this.timescroll
      }
    }

    // 设置波浪运动振幅
    atlas.meshes.forEach(function (mesh) {
      gsap.to(mesh.material.material.uniforms['wavesAmp'], {
        duration: 4,
        value: wavesAmp,
        onUpdate: function () {
          markRenderNeeded()
        },
      })
    })

    // 深链接
    if (params.initHash && params.initHash !== '') {
      atlas.skipAnimation()
      cameraControls.initFromUrl(params.initHash, 0)
      params.initHash = ''
    } else {
      // 设置相机目标位置
      if (seq == null || seq != 'random') {
        cameraControls.cameraGoto(new Vector3(0, 0, 30000), 2)
      }
    }
  }

  /** 播放片头图片散开为大爆炸分布的过渡动画。 */
  introAnimation(): void {
    const atlas = atlasRef()
    const cameraControls = cameraControlsRef()

    // 显示头部
    this.ui.showNavs()

    // 隐藏片头文字
    this.hideIntroText()

    // 播放动画
    const mdl = atlas.mdLabels.labels[0]
    // `MetadataLabel.fadeOut` 不接受时长参数（固定 0.6 秒）
    if (mdl) mdl.fadeOut()
    setTimeout(() => {
      const duration = 3
      cameraControls.cameraGoto(
        new Vector3(0, 0, 10000),
        duration,
        () => {
          // 固定最旧条目的位置
          for (let i = 0, l = atlas.assets.length; i < l; i++) {
            atlas.assets[i].setPosition(
              PRNG.random() * 2 - 1,
              8 + (Math.random() * 2 - 1),
              -10 - i * 0.1,
            )
            atlas.assets[i].setColor(1, 1, 1)
          }
          atlas.skipAnimation()

          // 应用随机公式
          cameraControls.setState(cameraControls.VISUALIZER_RANDOM)
          // 省略 `y` / `z`：公式的 `polar` 模式只读取 `amp.x`
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

      // 让片头图片淡出
      setTimeout(introItem.stop, duration * 1000 - 500, 2)
    }, 1000)
  }

  showIntro(): void {
    this.isIntro = false
    // 隐藏头部
    this.ui.hideNavs()
    // 显示片头
    this.showIntroText()
    this.showIntroDistribution()
  }

  showIntroText(): void {
    // 获取 DOM 元素
    const startScreenEl = document.body.querySelector('.intro-start-screen')
    startScreenEl.classList.add('show')

    // 等待开始按钮的点击
    const btn = startScreenEl.querySelector('.start-btn')
    btn.addEventListener(
      'click',
      () => {
        this.start('random')
      },
      false,
    )
    btn.classList.add('show')

    // 标记已展示过，避免后续（如清空搜索）再次显示
    this.introAlreadyShown = true
  }

  // 将资源分配到各自的默认位置
  showIntroDistribution(): void {
    const atlas = atlasRef()
    const cameraControls = cameraControlsRef()

    // 只展示最旧资源的动画
    const oldestAsset = atlas.getOldestAsset()
    if (oldestAsset) {
      // 隐藏所有资源
      PRNG.setSeed(0)
      for (let i = 0, l = atlas.assets.length; i < l; i++) {
        atlas.assets[i].setPosition(
          (PRNG.random() * 2 - 1) * 100000,
          10000,
          (PRNG.random() * 2 - 1) * 100000,
        )
        atlas.assets[i].setColor(0, 0, 0)
      }
      // 直接跳到目标位置
      atlas.skipAnimation()

      // 设置最旧资源的位置
      const h = oldestAsset.sizeNorm.w

      cameraControls.setState(cameraControls.IDLE)

      cameraControls.target.position.copy(oldestAsset.position) // 相当于 (0, h * 0.5, 0)
      const camera = cameraRef()
      camera.position.set(-h * 1.5, h * 0.5, 60)
      // 必须传入 `target.position`：`lookAt` 需要向量，若传入 `Object3D`
      // 会因读不到坐标而产生 NaN 四元数
      camera.lookAt(cameraControls.target.position)
    }
  }

  hideIntroText(): void {
    // 获取 DOM 元素
    const startScreenEl = document.body.querySelector('.intro-start-screen')
    startScreenEl.classList.remove('show')
  }

  // 时间线 -------------------------------------------------

  startScrollNoDatesItems(
    itemsWithoutDate: string[],
    seq?: string | null,
    initialisedCamera?: boolean,
  ): void {
    // `seq` 与 `initialisedCamera` 未使用（仅为签名一致保留，
    // `Timescroll.setup` 只传第一个参数）
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

    // 设置波浪运动振幅
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
    new ColorFormula(new Color(0, 0, 0)).apply(assetsNoDates)
    // 省略 `y` / `z`：只读取 `amp.x`
    new RandomFormula({ x: 6000 } as RandomFormulaAmplitude, 'polar', false, 10000).apply(
      assetsNoDates,
    )
  }

  ////////// 历史记录

  pushUrl(seq?: string | null): void {
    if (seq == null || seq == '') return

    const href = getCurrentUrl()
    if (href.lastIndexOf(seq) == -1) {
      const bits = href.split('/')
      bits.pop()
      const id = bits.join('/') + '/' + seq

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
  }
}

// 启动 ------------------------------------
/**
 * 引擎引导入口：在所有模块加载完成后调用一次，用于启动引擎。
 * 不能在模块 import 阶段执行。
 */
export function bootFreefall(): void {
  mainSetup(window.innerWidth, window.innerHeight)
}
