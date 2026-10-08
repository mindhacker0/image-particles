import { gsap } from 'gsap'
import { createCookie, readCookie } from '../engine/utils/functions'
import { legacyApp, legacyCameraControls, legacyParams } from '../engine/legacyScope'
import { setUiController } from './controller'
import { PartnersUi } from './partners/PartnersUi'
import { setUiState } from './store'
import { uiNodes } from './uiNodes'

/** 章节主界面的门面，把引擎的界面状态写入 UI store。 */

type SyntheticOrDomEvent = { preventDefault?(): void; stopPropagation?(): void }

export class ChapterUi {
  partners: PartnersUi

  // 帮助引导
  helpPlayed = false
  helpRunning = false
  helpStartAnimated = false

  // 底部
  rotationMode = false
  three = false

  private hscontainer: HTMLElement | null = null
  private hstooltips: HTMLElement[] = []
  private hsmouse: HTMLElement | null = null
  private hsartwork: HTMLElement | null = null
  private hsmousewheel: HTMLElement | null = null
  private clickPath: Element | null = null
  private onHsContainerClick: ((event: Event) => void) | null = null

  constructor() {
    this.partners = new PartnersUi()

    setUiController(this)
  }

  // 引擎会直接读取的 DOM 成员 ---------------------------

  get header_el(): HTMLElement | null {
    return uiNodes.header
  }

  get loader_el(): HTMLElement | null {
    return uiNodes.loader
  }

  get navs(): HTMLElement[] {
    return uiNodes.navs
  }

  get buttons(): HTMLElement[] {
    return uiNodes.buttons
  }

  get trivia(): HTMLElement[] {
    return uiNodes.triviaPanels
  }

  get triviaReup(): HTMLElement | null {
    return uiNodes.triviaReup
  }

  get partnerFooterLink(): HTMLElement | null {
    return uiNodes.partnersLink
  }

  get footerMapNav(): HTMLElement | null {
    return uiNodes.footerMapNav
  }

  get spaceToggleButton(): HTMLElement | null {
    return uiNodes.spaceToggle
  }

  /** 本页没有底部旋转切换按钮，固定返回 null。 */
  get rotationToggleButton(): HTMLElement | null {
    return null
  }

  get rotationToggleTooltip(): HTMLElement | null {
    return null
  }

  resize(): void {
    this.partners.resize()
  }

  // 头部 ----------------------------------------------------------------

  showHeader(): void {
    setUiState({ headerVisible: true })
  }

  hideHeader(): void {
    setUiState({ headerVisible: false, footerMapNavShown: false })
  }

  // 导航 -------------------------------------------------------------------

  hideNavs(): void {
    setUiState({ navsOpened: false })
  }

  showNavs(): void {
    setUiState({ navsOpened: true })
  }

  highlightButtonBySeqName(id: string): void {
    setUiState({ selectedSeq: id })
  }

  setButtonHighlight(bt: HTMLElement | null): void {
    setUiState({ selectedSeq: bt?.getAttribute('data-seq') ?? null })
  }

  // 底部 ----------------------------------------------------------------

  rotationShiftPressed(): void {
    if (!this.rotationToggleButton) return

    this.rotationMode = true
    legacyCameraControls().onShift(this.rotationMode)
  }

  rotationShiftReleased(): void {
    if (!this.rotationToggleButton) return

    this.rotationMode = false
    legacyCameraControls().onShift(this.rotationMode)
  }

  showRotationToolTip(): void {
    // 本章节没有旋转切换按钮
  }

  onRotationToogleEnter(): void {
    gsap.killTweensOf(this.showRotationToolTip)
    gsap.delayedCall(0.25, this.showRotationToolTip)
  }

  onRotationToogleLeave(): void {
    gsap.killTweensOf(this.showRotationToolTip)
  }

  onRotationToogleClick(event?: SyntheticOrDomEvent): void {
    event?.preventDefault?.()
    if (!this.rotationToggleButton) return

    const checked = !this.rotationMode
    legacyCameraControls().onShift(checked)
    this.rotationMode = checked
  }

  onSpaceToogleClick(event?: SyntheticOrDomEvent): void {
    event?.preventDefault?.()

    if (legacyApp().prevSeq !== 'timeline' || !this.spaceToggleButton) return

    const checked = !this.three
    legacyCameraControls().onShift(checked)
    this.three = checked
    // 处于平面 2D 地图时显示 .threed
    setUiState({ threeD: !checked })
  }

  showFooterMapMenu(): void {
    if (!this.footerMapNav) return

    this.three = false
    setUiState({ footerMapNavShown: true, threeD: Boolean(this.spaceToggleButton) })
  }

  hideFooterMapMenu(): void {
    if (!this.footerMapNav) return

    setUiState({ footerMapNavShown: false })
  }

  // 帮助引导 ------------------------------------------------------------

  startHelp(delay?: number): boolean {
    if (this.helpRunning) {
      this.onCompleteHelpStart()
      return false
    }

    if (this.helpPlayed) return false

    const help = uiNodes.help
    if (!help) return false

    if (readCookie(`cilex-help-gotit${legacyParams().directChapter ?? ''}`) === '1') return false

    const wait = delay || 3

    this.hscontainer = help.container
    this.hstooltips = help.tooltips
    this.hsmouse = help.mouse
    this.hsartwork = help.artwork
    this.hsmousewheel = help.mouseWheel
    this.clickPath = help.clickPath

    this.helpRunning = true

    gsap.set(this.hstooltips, {
      autoAlpha: 0,
      scale: 0.7,
      transformOrigin: '0% 50%',
    })
    gsap.set(this.hsmouse, { autoAlpha: 0, scale: 0.7 })
    gsap.set(this.hsartwork, { autoAlpha: 0, scale: 0.7 })
    gsap.set(this.hsmousewheel, { autoAlpha: 0, scale: 0.5 })

    const readyTime = 4
    const timeShow = 0.35
    const timeHide = 0.2
    const easeShow = 'back.out'
    const easeHide = 'back.in'
    const centerOrigin = '0% 50%'

    this.helpStartAnimated = true

    let current = wait

    gsap.to(this.hscontainer, { duration: 0.8, autoAlpha: 1, delay: current })

    // 步骤 1
    current += 0.5
    gsap.to(this.hsmouse, {
      duration: timeShow,
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
    })
    gsap.to(this.hstooltips[0], {
      duration: timeShow,
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      transformOrigin: centerOrigin,
    })
    this.loopClickPath(0)

    current += readyTime

    gsap.to(this.hstooltips[0], { duration: timeHide, autoAlpha: 0, delay: current })

    // 步骤 2
    current += 0.3
    gsap.to(this.hsmousewheel, {
      duration: timeShow,
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      onStart: () => {
        this.helpStartAnimated = false
      },
    })
    gsap.to(this.hstooltips[1], {
      duration: 0.2,
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      transformOrigin: centerOrigin,
    })

    current += readyTime

    gsap.to(this.hstooltips[1], { duration: timeHide, autoAlpha: 0, delay: current })
    gsap.to(this.hsmouse, {
      duration: 0.3,
      autoAlpha: 0,
      scale: 0.7,
      ease: easeHide,
      delay: current,
    })
    gsap.to(this.hsmousewheel, {
      duration: 0.2,
      autoAlpha: 0,
      scale: 0.7,
      ease: easeHide,
      delay: current,
    })

    // 步骤 3
    current += 0.5

    gsap.to(this.hsartwork, {
      duration: timeShow,
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
    })
    gsap.to(this.hstooltips[2], {
      duration: timeShow,
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      transformOrigin: centerOrigin,
    })

    current += readyTime + 0.5

    gsap.to(this.hsartwork, {
      duration: 0.3,
      autoAlpha: 0,
      scale: 0.7,
      ease: easeHide,
      delay: current,
    })
    gsap.to(this.hstooltips[2], { duration: timeHide, autoAlpha: 0, delay: current })

    current += 0.1

    this.onHsContainerClick = this.onHelpStartClick.bind(this)
    this.hscontainer?.addEventListener('click', this.onHsContainerClick, false)

    gsap.to(this.hscontainer, {
      duration: 0.6,
      autoAlpha: 0,
      delay: current,
      onComplete: () => this.onCompleteHelpStart(),
    })

    // 记录已读标记，100 天后过期
    createCookie(`cilex-help-gotit${legacyParams().directChapter ?? ''}`, '1', 100)

    this.helpPlayed = true
    return true
  }

  loopClickPath(opacity: number): void {
    if (this.helpStartAnimated || opacity === 1) {
      gsap.to(this.clickPath, {
        duration: 0.7,
        fillOpacity: opacity,
        onComplete: () => this.loopClickPath(opacity === 0.5 ? 1 : 0.5),
      })
    }
  }

  onCompleteHelpStart(): void {
    gsap.killTweensOf(this.hscontainer)
    gsap.killTweensOf(this.hsartwork)
    gsap.killTweensOf(this.hsmouse)
    gsap.killTweensOf(this.hsmousewheel)
    gsap.killTweensOf(this.clickPath)
    this.hstooltips.forEach((tooltip) => gsap.killTweensOf(tooltip))

    this.helpRunning = false
    this.helpStartAnimated = false

    if (this.onHsContainerClick) {
      this.hscontainer?.removeEventListener('click', this.onHsContainerClick, false)
    }

    gsap.to(this.hscontainer, { duration: 0.6, autoAlpha: 0 })
  }

  onHelpStartClick(): void {
    this.onCompleteHelpStart()
  }

  // 加载 ---------------------------------------------------------------

  stopLoading(): void {
    setUiState({ loading: false })
  }

  startLoading(): void {
    setUiState({ loading: true })
  }
}
