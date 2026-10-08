import { useSyncExternalStore } from 'react'

/**
 * React 外壳的 UI 状态。
 */

export interface UiState {
  /** 头部是否可见 */
  headerVisible: boolean
  /** 导航列表是否已展开 */
  navsOpened: boolean
  /** 当前高亮的序列 */
  selectedSeq: string | null
  /** 关闭说明后展示的重新打开按钮 */
  triviaReupOpened: boolean
  /** 底部地图菜单是否显示 */
  footerMapNavShown: boolean
  /** 3D/2D 切换状态 */
  threeD: boolean
  /** 头部加载中状态 */
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

/** 订阅状态变化，返回取消订阅函数（供 `useSyncExternalStore` 使用）。 */
export function subscribeUi(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 合并更新状态并通知所有订阅者。 */
export function setUiState(patch: Partial<UiState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

/** 供 UI 组件使用的 React Hook。 */
export function useUiState(): UiState {
  return useSyncExternalStore(subscribeUi, getUiState, getUiState)
}
