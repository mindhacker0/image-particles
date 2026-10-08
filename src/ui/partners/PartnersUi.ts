import { shared } from '../../engine/Main'
import { legacyParams } from '../../engine/legacyScope'
import { Twix, type LegacyRequest } from '../../legacy/twixLegacy'
import { partnersNodes } from './nodes'
import { getPartnersState, setPartnersState, type PartnerEntry, type PartnerItem } from './state'

/**
 * 伙伴界面的门面，供引擎按原有 API 调用（`ChapterUi` 持有实例并调用
 * `resize()` / `open()`）。
 *
 * 标记由 `Partners.tsx` 渲染：本类通过 `nodes.ts` 的注册表读取节点，
 * 通过 `state.ts` 的 store 驱动界面。
 */

function windowWidth(): number {
  return shared.windowWidth
}

function windowHeight(): number {
  return shared.windowHeight
}

const PARTNER_URL_BASE = 'https://www.google.com/culturalinstitute/beta/partner/'
const PARTNER_URL_QUERY = '?utm_campaign=cilex_v1&utm_source=cilab&utm_medium=artsexperiments&utm_content='

let instance: PartnersUi | null = null

/**
 * `ChapterUi` 创建的实例，供 `Partners.tsx` 使用
 * （引擎自己实例化门面，组件无法通过 props 拿到它）。
 */
export function getPartnersUi(): PartnersUi | null {
  return instance
}

export class PartnersUi {
  /** `.partners` 容器。 */
  get container(): HTMLElement | null {
    return partnersNodes.container
  }

  /** `.partners ul` 列表。 */
  get container_ul(): HTMLElement | null {
    return partnersNodes.containerUl
  }

  /** `.partners` 的关闭按钮。 */
  get close_button(): HTMLElement | null {
    return partnersNodes.closeButton
  }

  /** `.partners` 的加载指示器。 */
  get preloader(): HTMLElement | null {
    return partnersNodes.preloader
  }

  /**
   * 请求是否已发送。一旦置为 `true` 便不再重置，之后的 `open()` 不会再次请求或
   * 显示 spinner，已展示的行继续保留。
   */
  loading = false

  /** 进行中的 `/freefall/partners` 请求。 */
  xhr: LegacyRequest | null = null

  /** `resize` 应用到 `.partners` 的高度。 */
  panelH = 400

  /** 面板是否打开。 */
  opened = false

  /** 已展示的行数。 */
  popuCount = 0

  /** 每批展示的行数。 */
  popuNum = 10

  /** 解析后的 `/freefall/partners` 响应；到达前为 `null`。 */
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

    // `params.directChapter` 在两批之间不会变化，因此只读取一次
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

      // 用 `Image` 预加载来划分批次：当前批次的 logo 全部取回后再开始下一批
      const image = new Image()

      const onLoaded = () => {
        loadCount++
        if (loadCount === loadTot) {
          this.popuCount = dest
          this.addPartners()
        }
      }

      image.onload = onLoaded
      // 加载失败的 logo 也计入完成，保证批次总能推进，不会中断队列
      image.onerror = onLoaded
      image.src = imageUrl
    }

    // 整批行一次性发布，渲染一次即可
    setPartnersState({ partners: [...getPartnersState().partners, ...entries] })
  }

  populate(json: string): void {
    let parsed: unknown

    try {
      parsed = JSON.parse(json)
    } catch (cause) {
      // 解析失败时停止 spinner，面板保持为空
      console.error('[PartnersUi] could not parse the /freefall/partners response', cause)
      setPartnersState({ loading: false })
      return
    }

    if (!Array.isArray(parsed)) {
      // 响应不是数组时视为无数据，停止 spinner
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
        // 请求失败时停止 spinner，面板仍可打开（优雅降级）
        error: (status) => {
          console.warn(`[PartnersUi] GET /freefall/partners failed (status ${status})`)
          setPartnersState({ loading: false })
        },
      })
    }

    setPartnersState({ partnersOpened: true, closeButtonShown: true })
  }
}
