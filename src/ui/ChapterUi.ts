import { TweenLite, legacyEases } from '../legacy/gsapLegacy'
import { createCookie, readCookie } from '../engine/utils/functions'
import { legacyApp, legacyCameraControls, legacyParams } from '../engine/legacyScope'
import { setUiController } from './controller'
import { PartnersUi } from './partners/PartnersUi'
import { setUiState } from './store'
import { uiNodes } from './uiNodes'

/**
 * `js/ui/chapter_ui.js` ported to TypeScript.
 *
 * The markup used to live in `index.html` and the class toggles were applied with
 * `classList`; here the markup is rendered by React (`src/ui/**`) and the classes
 * come from `src/ui/store.ts`. The public API is kept identical because
 * `js/apps/app_freefall.js` and `js/main.js` still drive the interface through
 * `app.ui` and `getComputedStyle(ui.header_el)`.
 */

type SyntheticOrDomEvent = { preventDefault?(): void; stopPropagation?(): void }

export class ChapterUi {
  partners: PartnersUi

  // help
  helpPlayed = false
  helpRunning = false
  helpStartAnimated = false

  // footer
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

  // DOM members the legacy engine reads directly ---------------------------

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

  /** The footer rotation toggle is not part of this page's markup. */
  get rotationToggleButton(): HTMLElement | null {
    return null
  }

  get rotationToggleTooltip(): HTMLElement | null {
    return null
  }

  resize(): void {
    this.partners.resize()
  }

  // HEADER ----------------------------------------------------------------

  showHeader(): void {
    setUiState({ headerVisible: true })
  }

  hideHeader(): void {
    setUiState({ headerVisible: false, footerMapNavShown: false })
  }

  // NAV -------------------------------------------------------------------

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

  // FOOTER ----------------------------------------------------------------

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
    // no rotation toggle in this chapter
  }

  onRotationToogleEnter(): void {
    TweenLite.killDelayedCallsTo(this.showRotationToolTip)
    TweenLite.delayedCall(0.25, this.showRotationToolTip, [], this)
  }

  onRotationToogleLeave(): void {
    TweenLite.killDelayedCallsTo(this.showRotationToolTip)
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
    // `.threed` is shown while the flat 2D map is active
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

  // HELP START ------------------------------------------------------------

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

    TweenLite.set(this.hstooltips, {
      autoAlpha: 0,
      scale: 0.7,
      transformOrigin: { left: 0, top: '50%' },
    })
    TweenLite.set(this.hsmouse, { autoAlpha: 0, scale: 0.7 })
    TweenLite.set(this.hsartwork, { autoAlpha: 0, scale: 0.7 })
    TweenLite.set(this.hsmousewheel, { autoAlpha: 0, scale: 0.5 })

    const readyTime = 4
    const timeShow = 0.35
    const timeHide = 0.2
    const easeShow = legacyEases.Back.easeOut
    const easeHide = legacyEases.Back.easeIn
    const centerOrigin = { left: 0, top: '50%' }

    this.helpStartAnimated = true

    let current = wait
    // arrow scope because the tween callbacks are invoked with `this` bound to
    // the tween vars object by the GSAP facade
    const scope = this

    TweenLite.to(this.hscontainer, 0.8, { autoAlpha: 1, delay: current })

    // step 1
    current += 0.5
    TweenLite.to(this.hsmouse, timeShow, {
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
    })
    TweenLite.to(this.hstooltips[0], timeShow, {
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      transformOrigin: centerOrigin,
    })
    this.loopClickPath(0)

    current += readyTime

    TweenLite.to(this.hstooltips[0], timeHide, { autoAlpha: 0, delay: current })

    // step 2
    current += 0.3
    TweenLite.to(this.hsmousewheel, timeShow, {
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      onStartScope: this,
      onStart() {
        scope.helpStartAnimated = false
      },
    })
    TweenLite.to(this.hstooltips[1], 0.2, {
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      transformOrigin: centerOrigin,
    })

    current += readyTime

    TweenLite.to(this.hstooltips[1], timeHide, { autoAlpha: 0, delay: current })
    TweenLite.to(this.hsmouse, 0.3, {
      autoAlpha: 0,
      scale: 0.7,
      ease: easeHide,
      delay: current,
    })
    TweenLite.to(this.hsmousewheel, 0.2, {
      autoAlpha: 0,
      scale: 0.7,
      ease: easeHide,
      delay: current,
    })

    // step 3
    current += 0.5

    TweenLite.to(this.hsartwork, timeShow, {
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
    })
    TweenLite.to(this.hstooltips[2], timeShow, {
      autoAlpha: 1,
      scale: 1,
      ease: easeShow,
      delay: current,
      transformOrigin: centerOrigin,
    })

    current += readyTime + 0.5

    TweenLite.to(this.hsartwork, 0.3, {
      autoAlpha: 0,
      scale: 0.7,
      ease: easeHide,
      delay: current,
    })
    TweenLite.to(this.hstooltips[2], timeHide, { autoAlpha: 0, delay: current })

    current += 0.1

    this.onHsContainerClick = this.onHelpStartClick.bind(this)
    this.hscontainer?.addEventListener('click', this.onHsContainerClick, false)

    TweenLite.to(this.hscontainer, 0.6, {
      autoAlpha: 0,
      delay: current,
      onComplete: this.onCompleteHelpStart,
      onCompleteScope: this,
    })

    // got it for 100 days
    createCookie(`cilex-help-gotit${legacyParams().directChapter ?? ''}`, '1', 100)

    this.helpPlayed = true
    return true
  }

  loopClickPath(opacity: number): void {
    if (this.helpStartAnimated || opacity === 1) {
      TweenLite.to(this.clickPath, 0.7, {
        fillOpacity: opacity,
        onComplete: this.loopClickPath,
        onCompleteScope: this,
        onCompleteParams: [opacity === 0.5 ? 1 : 0.5],
      })
    }
  }

  onCompleteHelpStart(): void {
    TweenLite.killTweensOf(this.hscontainer)
    TweenLite.killTweensOf(this.hsartwork)
    TweenLite.killTweensOf(this.hsmouse)
    TweenLite.killTweensOf(this.hsmousewheel)
    TweenLite.killTweensOf(this.clickPath)
    this.hstooltips.forEach((tooltip) => TweenLite.killTweensOf(tooltip))

    this.helpRunning = false
    this.helpStartAnimated = false

    if (this.onHsContainerClick) {
      this.hscontainer?.removeEventListener('click', this.onHsContainerClick, false)
    }

    TweenLite.to(this.hscontainer, 0.6, { autoAlpha: 0 })
  }

  onHelpStartClick(): void {
    this.onCompleteHelpStart()
  }

  // LOADING ---------------------------------------------------------------

  stopLoading(): void {
    setUiState({ loading: false })
  }

  startLoading(): void {
    setUiState({ loading: true })
  }
}
