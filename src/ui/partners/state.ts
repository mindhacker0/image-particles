import { useSyncExternalStore } from 'react'

/**
 *
 * Observable state of the partners screen, the feature-local twin of
 * `src/ui/store.ts` (same shape: module state + `getX()` / `subscribeX()` /
 * `setX()` + a `useSyncExternalStore` hook). `PartnersUi` is the only writer and
 * `Partners.tsx` the only reader.
 *
 * Every field mirrors one DOM write of the legacy class:
 *   `.partners.open`                     <- open() / close()
 *   `.partners button.show`              <- open() / close()
 *   `.partners .mdl-spinner.is-active`   <- open() (added) / populate() (removed)
 *   `.partners` inline `height`          <- resize()
 *   `.partners ul` inline `margin-left`  <- resize()
 *   the `li > a > img` rows              <- addPartners()
 */

/** One row of the `/freefall/partners` response (legacy `this.data[i]`). */
export interface PartnerItem {
  /** partner slug: used in the partner url */
  url: string
  /** logo url; the legacy code appended the `-s64` size suffix to it */
  logo: string
  /** alt text of the logo */
  title: string
}

/** A partner row ready to render: the legacy `li > a > img` of `addPartners`. */
export interface PartnerEntry {
  /** partner slug (legacy `nodeLink.idLink`) */
  url: string
  /** link built like the legacy one, from `params.directChapter` */
  href: string
  /** `item.logo + '-s64'`, the `src` of the logo */
  imageUrl: string
  /** `item.title`, the `alt` of the logo */
  title: string
}

export interface PartnersState {
  /** `.partners.open`: the panel covers the screen */
  partnersOpened: boolean
  /** `.partners button.show`: the close button is revealed */
  closeButtonShown: boolean
  /** `.partners .mdl-spinner.is-active`: the request has not answered yet */
  loading: boolean
  /** inline height of `.partners`, in px (`resize`) */
  panelHeight: number
  /** inline margin-left of `.partners ul`, in px (`resize`) */
  listMarginLeft: number
  /** rows revealed so far: `addPartners` appends them by batches of `popuNum` */
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

/** React hook used by the partners component. */
export function usePartnersState(): PartnersState {
  return useSyncExternalStore(subscribePartners, getPartnersState, getPartnersState)
}
