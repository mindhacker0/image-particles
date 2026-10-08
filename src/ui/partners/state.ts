import { useSyncExternalStore } from 'react'

/**
 * 伙伴界面的可观察状态，是 `src/ui/store.ts` 的局部对应物
 * （同样由模块状态、`getX()` / `subscribeX()` / `setX()` 和
 * `useSyncExternalStore` Hook 组成）。`PartnersUi` 是唯一写入方，
 * `Partners.tsx` 是唯一读取方。
 */

/** `/freefall/partners` 响应中的一行。 */
export interface PartnerItem {
  /** 伙伴标识，用于拼接伙伴页面 URL。 */
  url: string
  /** logo 地址；使用时拼上 `-s64` 尺寸后缀。 */
  logo: string
  /** logo 的替代文本。 */
  title: string
}

/** 可直接渲染的伙伴行（`li > a > img`）。 */
export interface PartnerEntry {
  /** 伙伴标识。 */
  url: string
  /** 由 `params.directChapter` 拼出的链接。 */
  href: string
  /** logo 的 `src`（`logo` 加 `-s64` 后缀）。 */
  imageUrl: string
  /** logo 的 `alt`。 */
  title: string
}

export interface PartnersState {
  /** 面板是否铺满屏幕（`.partners.open`）。 */
  partnersOpened: boolean
  /** 关闭按钮是否显示（`.partners button.show`）。 */
  closeButtonShown: boolean
  /** 请求是否进行中（`.partners .mdl-spinner.is-active`）。 */
  loading: boolean
  /** `.partners` 的内联高度（px）。 */
  panelHeight: number
  /** `.partners ul` 的内联左边距（px）。 */
  listMarginLeft: number
  /** 已展示的行，`addPartners` 按 `popuNum` 分批追加。 */
  partners: PartnerEntry[]
}

const initialState: PartnersState = {
  partnersOpened: false,
  closeButtonShown: false,
  loading: false,
  panelHeight: 0,
  listMarginLeft: 0,
  partners: [],
}

let state: PartnersState = initialState

const listeners = new Set<() => void>()

export function getPartnersState(): PartnersState {
  return state
}

/** 订阅状态变化，返回取消订阅函数。 */
export function subscribePartners(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setPartnersState(patch: Partial<PartnersState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

/** 供伙伴组件使用的 React Hook。 */
export function usePartnersState(): PartnersState {
  return useSyncExternalStore(subscribePartners, getPartnersState, getPartnersState)
}
