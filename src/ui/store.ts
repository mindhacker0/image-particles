import { useSyncExternalStore } from 'react'

/**
 * UI state of the React shell.
 */


export interface UiState {
  /** header visibility (`.cilex-header.show`) */
  headerVisible: boolean
  /** nav lists opened (`.nav.opened`) */
  navsOpened: boolean
  /** sequence highlighted in the nav */
  selectedSeq: string | null
  /** the small "reopen" button shown after the user closed a trivia */
  triviaReupOpened: boolean
  /** footer map menu (3D/2D toggle) visibility */
  footerMapNavShown: boolean
  /** 3D/2D toggle state (`.space-toggle.threed`) */
  threeD: boolean
  /** loading spinner in the header (`.search-preloader.is-active`) */
  loading: boolean
}

const initialState: UiState = {
  headerVisible: false,
  navsOpened: false,
  selectedSeq: null,
  triviaReupOpened: false,
  footerMapNavShown: false,
  threeD: false,
  loading: false,
}

let state: UiState = initialState

const listeners = new Set<() => void>()

export function getUiState(): UiState {
  return state
}

export function subscribeUi(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setUiState(patch: Partial<UiState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

/** React hook used by the UI components. */
export function useUiState(): UiState {
  return useSyncExternalStore(subscribeUi, getUiState, getUiState)
}
