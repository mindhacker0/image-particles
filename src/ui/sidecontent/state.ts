import { useSyncExternalStore } from 'react'

/**
 *
 * Observable state of the "side content" (the help / app dialogs that
 * used to live in `index.html`), mirroring the pattern of `src/ui/store.ts`:
 * module state, getters, `subscribe()` and a `useSyncExternalStore` hook.
 *
 * `src/ui/sidecontent/SideContentFacade.ts` (the port of the legacy `Sidect`
 * class) is the only writer, the components of `SideContent.tsx` only read. The
 * legacy class mutated the markup imperatively - `setAttribute('open', '')`,
 * `classList.add('show')`, `input.value = ...`, `setTimeout` - and every one of
 * those mutations is a field below, so React can render them instead.
 */

/** The three `<dialog class="mdl-dialog ...">` of the page. */
export type SideContentDialog = 'help' | 'app'

export interface SideContentState {
  /** `dialog.help[open]` */
  helpOpened: boolean
  /** `dialog.app[open]` */
  appOpened: boolean
  /**
   * `.mdl-dialog-back.show` (the full page backdrop; see the `.show` utility
   * class of `css/main.css`)
   */
  backShown: boolean
  /**
   * Item detail panel ("side content" proper) of the original experiment.
   *
   * NOTE: `js/ui/sidect.js` does not build or mutate such a panel in this
   * snapshot - it only looked up the (already removed) `div.pages` container and
   * never used it, no other module of the repository creates a panel either, and
   * `css/main.css` has no rule for one. The fields are declared so the metadata
  * layer can drive one without another store change;
   * `SideContent.tsx` does not render them yet and the facade never writes them.
   */
  itemOpened: boolean
  itemId: string | null
  itemTitle: string | null
  itemUrl: string | null
  /** accent colour of the item panel, like `.chaptercolor` is for the dialogs */
  itemColor: string | null
}

const initialState: SideContentState = {
  helpOpened: false,
  appOpened: false,
  backShown: false,
  itemOpened: false,
  itemId: null,
  itemTitle: null,
  itemUrl: null,
  itemColor: null,
}

let state: SideContentState = initialState

const listeners = new Set<() => void>()

export function getSideContentState(): SideContentState {
  return state
}

export function subscribeSideContent(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSideContentState(patch: Partial<SideContentState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

/** React hook used by the components. */
export function useSideContentState(): SideContentState {
  return useSyncExternalStore(subscribeSideContent, getSideContentState, getSideContentState)
}

/**
 * `Sidect.openCurrentDialog`: only one dialog is tracked at a time, so opening
 * one closes the others, and the backdrop is shown with the dialog.
 */
export function openSideContentDialog(dialog: SideContentDialog): void {
  setSideContentState({
    helpOpened: dialog === 'help',
    appOpened: dialog === 'app',
    backShown: true,
  })
}

/** `Sidect.closeCurrentDialog`: no dialog is open and the backdrop is hidden. */
export function closeSideContentDialog(): void {
  setSideContentState({
    helpOpened: false,
    appOpened: false,
    backShown: false,
  })
}
