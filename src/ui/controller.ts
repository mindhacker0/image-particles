import type { MouseEvent as ReactMouseEvent } from 'react'

/**
 * Bridge between the React components and the `ChapterUi` facade.
 *
 * The legacy engine instantiates `ChapterUi` itself (`new ChapterUi()` in
 * `js/apps/app_freefall.js`), so the React components cannot receive the
 * instance as a prop. The instance registers itself here, and the components
 * dispatch the clicks that used to be bound by the facade constructor.
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
