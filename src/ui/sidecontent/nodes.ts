/**
 *
 * Registry of the DOM nodes the side content components render, the same idea as
 * `src/ui/uiNodes.ts`: the legacy class exposed the dialog nodes and bound its
 * listeners to them. React owns that markup now, so the components publish their
 * remaining nodes here and `SideContentFacade.ts` reads them back.
 */

export interface SideContentNodes {
  /** `.mdl-dialog-back` */
  back: HTMLElement | null
  /** `dialog.help` */
  helpDialog: HTMLDialogElement | null
  /** `dialog.app` */
  appDialog: HTMLDialogElement | null
  /** `dialog.app a` (the app store links) */
}

export const sideContentNodes: SideContentNodes = {
  back: null,
  helpDialog: null,
  appDialog: null,
}
