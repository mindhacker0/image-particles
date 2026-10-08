import { useSyncExternalStore } from 'react'

/**
 * “侧边内容”（帮助 / 应用对话框）的可观察状态，沿用 `src/ui/store.ts` 的模式：
 * 模块状态、getter、`subscribe()` 与 `useSyncExternalStore` Hook。
 *
 * `SideContentFacade.ts` 是唯一写入方，`SideContent.tsx` 的组件只读取。
 */

/** 页面上 `<dialog class="mdl-dialog ...">` 的类型。 */
export type SideContentDialog = 'help' | 'app'

export interface SideContentState {
  /** 帮助对话框是否打开（`dialog.help[open]`）。 */
  helpOpened: boolean
  /** 全屏背景遮罩是否显示（`.mdl-dialog-back.show`）。 */
  backShown: boolean
  /**
   * 原实验的条目详情面板。当前 `SideContent.tsx` 尚未渲染，门面也不会写入；
   * 字段先声明，便于后续由元数据层驱动。
   */
  itemOpened: boolean
  itemId: string | null
  itemTitle: string | null
  itemUrl: string | null
  /** 条目面板的强调色。 */
  itemColor: string | null
}

const initialState: SideContentState = {
  helpOpened: false,
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

/** 订阅状态变化，返回取消订阅函数。 */
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

/** 供组件使用的 React Hook。 */
export function useSideContentState(): SideContentState {
  return useSyncExternalStore(subscribeSideContent, getSideContentState, getSideContentState)
}

/** 同一时刻只跟踪一个对话框，打开一个即关闭其他，并显示遮罩。 */
export function openSideContentDialog(dialog: SideContentDialog): void {
  setSideContentState({
    helpOpened: dialog === 'help',
    backShown: true
  })
}

/** 关闭所有对话框并隐藏遮罩。 */
export function closeSideContentDialog(): void {
  setSideContentState({
    helpOpened: false,
    backShown: false
  })
}
