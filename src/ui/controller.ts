import type { MouseEvent as ReactMouseEvent } from 'react'

/**
 * React 组件与 `ChapterUi` 门面之间的桥接层。
 *
 * 引擎自己创建 `ChapterUi` 实例，组件无法通过 props 拿到它，
 * 因此实例在此注册，组件通过 `uiController` 派发点击事件。
 */

export interface UiController {
  onSpaceToogleClick(event: ReactMouseEvent): void
}

let controller: UiController | null = null

export function setUiController(next: UiController | null): void {
  controller = next
}

export const uiController: UiController = {
  onSpaceToogleClick(event) {
    controller?.onSpaceToogleClick(event)
  },
}
