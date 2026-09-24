import { legacyParams } from '../../engine/legacyScope'
import { Twix, type LegacyRequest } from '../../legacy/twixLegacy'
import { partnersNodes } from './nodes'
import { getPartnersState, setPartnersState, type PartnerEntry, type PartnerItem } from './state'

/**
 *
 * Legacy compatible facade of the partners screen. The original class owned the
 * markup (it looked the nodes up in its constructor and mutated them with
 * `classList` and inline styles); the markup is React's now (`Partners.tsx`) and
 * this facade drives it through the store of `state.ts`, reading the nodes from
 * the registry of `nodes.ts` — exactly the split `src/ui/ChapterUi.ts` uses for
 * the main interface.
 *
 * Public API kept identical (`ChapterUi` owns the instance and calls
 * `this.partners.resize()` / `this.partners.open()`):
 *   members  container, container_ul, loading, xhr, panelH, opened, close_button,
 *            preloader, popuCount, popuNum, data
 *   methods  constructor(), resize(), close(), onClose(ev), addPartners(),
 *            populate(json), open()
 *
 * Port notes
 * ----------
 * - the four DOM members are getters over `partnersNodes` instead of constructor
 *   snapshots: React creates the nodes, so they only exist from the first mount on
 * - `container.style.height` and `container_ul.style.marginLeft` (written by
 *   `resize`) are store fields (`panelHeight`, `listMarginLeft`) rendered by the
 *   component; `panelH` still holds the height like the original member did
 * - the `close_button.addEventListener('click', this.onClose)` of the constructor
 *   is the `onClick` of the component, so no listener is bound here
 * - `/freefall/partners` is still requested with `Twix.ajax` on the first
 *   `open()`, and the global names `windowHeight` / `windowWidth` are still read
 *   for `resize` (both are owned by `src/engine/Main.ts`)
 */

/** The two globals `js/main.js` keeps up to date (`src/engine/Main.ts`). */
interface LegacyWindowSize {
  windowWidth?: number
  windowHeight?: number
}

function windowWidth(): number {
  // `??` and not `||`: the globals are set to `window.innerWidth` at import time
  // of Main.ts, the fallback only covers a call before that module ran (where the
  // original globals were `undefined` and `resize` wrote `NaN`)
  return (window as unknown as LegacyWindowSize).windowWidth ?? window.innerWidth
}

function windowHeight(): number {
  return (window as unknown as LegacyWindowSize).windowHeight ?? window.innerHeight
}

const PARTNER_URL_BASE = 'https://www.google.com/culturalinstitute/beta/partner/'
const PARTNER_URL_QUERY = '?utm_campaign=cilex_v1&utm_source=cilab&utm_medium=artsexperiments&utm_content='

let instance: PartnersUi | null = null

/**
 * The instance `ChapterUi` created, for `Partners.tsx` (the components cannot
 * receive it as a prop: the legacy engine instantiates the facade itself, the
 * same reason `src/ui/controller.ts` exists for `ChapterUi`).
 */
export function getPartnersUi(): PartnersUi | null {
  return instance
}

export class PartnersUi {
  /** `.partners` — legacy `this.container` */
  get container(): HTMLElement | null {
    return partnersNodes.container
  }

  /** `.partners ul` — legacy `this.container_ul` */
  get container_ul(): HTMLElement | null {
    return partnersNodes.containerUl
  }

  /** `.partners button` — legacy `this.close_button` */
  get close_button(): HTMLElement | null {
    return partnersNodes.closeButton
  }

  /** `.partners .mdl-spinner` — legacy `this.preloader` */
  get preloader(): HTMLElement | null {
    return partnersNodes.preloader
  }

  /**
   * `true` once the request has been sent. Kept 1:1: the original never reset it,
   * so a later `open()` neither fetches nor shows the spinner again — the rows
   * stay in the store, exactly like they stayed in the `<ul>`.
   */
  loading = false

  /** the pending `/freefall/partners` request (never aborted by the original) */
  xhr: LegacyRequest | null = null

  /** height `resize` applies to `.partners` (default of the original member) */
  panelH = 400

  /** `true` while the panel is open */
  opened = false

  /** rows already revealed */
  popuCount = 0

  /** rows revealed per batch (10 in the original) */
  popuNum = 10

  /** parsed `/freefall/partners` response, `null` until it arrives */
  data: PartnerItem[] | null = null

  constructor() {
    instance = this
  }

  resize(): void {
    const w = windowWidth() - 16

    this.panelH = windowHeight()

    setPartnersState({
      panelHeight: this.panelH,
      listMarginLeft: Math.floor((w - Math.floor(w / 100) * 100) * 0.5),
    })
  }

  close(): void {
    this.opened = false
    setPartnersState({ partnersOpened: false, closeButtonShown: false })
  }

  onClose(ev?: { preventDefault?(): void } | null): void {
    ev?.preventDefault?.()
    this.close()
  }

  addPartners(): void {
    const data = this.data
    if (!data) return

    const nbItems = data.length
    const dest = Math.min(nbItems, this.popuCount + this.popuNum)

    if (this.popuCount >= nbItems) return

    const loadTot = dest - this.popuCount
    let loadCount = 0

    // `params.directChapter` cannot change between two batches, so it is read
    // once (the original read the global on every iteration of the loop)
    const directChapter = String(legacyParams().directChapter)

    const entries: PartnerEntry[] = []

    for (let i = this.popuCount; i < dest; i++) {
      const item = data[i]
      const imageUrl = `${item.logo}-s64`

      entries.push({
        url: item.url,
        href: `${PARTNER_URL_BASE}${item.url}${PARTNER_URL_QUERY}${directChapter}`,
        imageUrl,
        title: item.title,
      })

      // the original used the `Image` object to append the `<img>` of the row; the
      // markup is React's now, so the preload only paces the batches: the next one
      // starts when every logo of the current one has been fetched
      const image = new Image()

      const onLoaded = () => {
        loadCount++
        if (loadCount === loadTot) {
          this.popuCount = dest
          this.addPartners()
        }
      }

      image.onload = onLoaded
      // FIX: the original only handled `onload`, so a single logo that failed to
      // load (no backend, a removed partner, a blocked CDN) left the batch
      // incomplete and stopped the queue for good. A failed logo is revealed too,
      // so the batch always completes.
      image.onerror = onLoaded
      image.src = imageUrl
    }

    // the rows were appended to the `<ul>` inside the loop; here the batch is
    // published in one update (same visible result, one render)
    setPartnersState({ partners: [...getPartnersState().partners, ...entries] })
  }

  populate(json: string): void {
    let parsed: unknown

    try {
      parsed = JSON.parse(json)
    } catch (cause) {
      // FIX: the original parsed inside the ajax callback, so a malformed body
      // threw there. The spinner is stopped and the panel stays empty instead.
      console.error('[PartnersUi] could not parse the /freefall/partners response', cause)
      setPartnersState({ loading: false })
      return
    }

    if (!Array.isArray(parsed)) {
      // the original assigned the value and returned silently (`this.data.length`
      // was `undefined`, so `addPartners` looped zero times)
      console.warn('[PartnersUi] unexpected /freefall/partners response, expected an array', parsed)
      this.data = null
      setPartnersState({ loading: false })
      return
    }

    this.data = parsed as PartnerItem[]
    setPartnersState({ loading: false })

    this.addPartners()
  }

  open(): void {
    this.opened = true
    this.resize()

    if (!this.loading) {
      setPartnersState({ loading: true })
      this.loading = true

      this.xhr = Twix.ajax({
        type: 'GET',
        url: '/freefall/partners',
        success: (json) => this.populate(json),
        // FIX: the original passed no `error` callback, so a failed request (the
        // mock deployment has no `/freefall/partners` route) left the spinner
        // spinning forever over an empty panel. The panel still opens and stays
        // usable, it just shows no partner (graceful degradation).
        error: (status) => {
          console.warn(`[PartnersUi] GET /freefall/partners failed (status ${status})`)
          setPartnersState({ loading: false })
        },
      })
    }

    setPartnersState({ partnersOpened: true, closeButtonShown: true })
  }
}

// `js/ui/partners_ui.js` declared the class as the global `PartnersUi`, and
// `src/ui/ChapterUi.ts` still resolves `this.partners` through that name. The
// port keeps it available (like `src/engine/install.ts` publishes `ChapterUi`),
// but only if the global is free: while the classic script is still listed in
// `src/legacy/scriptOrder.ts` it loads later and keeps ownership of the name.
const partnerGlobalScope = window as unknown as { PartnersUi?: typeof PartnersUi }

partnerGlobalScope.PartnersUi ??= PartnersUi
