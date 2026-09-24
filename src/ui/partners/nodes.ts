/**
 *
 * Registry of the DOM nodes `Partners.tsx` renders, the same hand-off as
 * `src/ui/uiNodes.ts` (which this feature must not edit): the legacy class kept
 * the four nodes it needs in instance members, so the facade keeps exposing
 * `container`, `container_ul`, `close_button` and `preloader` by reading them
 * here. React owns the markup, so the component publishes the nodes after mount
 * and clears them on unmount — the entries are therefore `null` before the first
 * mount (the legacy snapshots existed from the constructor on).
 */

export interface PartnersNodes {
  /** `.partners` (legacy `container`) */
  container: HTMLElement | null
  /** `.partners ul` (legacy `container_ul`) */
  containerUl: HTMLElement | null
  /** `.partners button` (legacy `close_button`) */
  closeButton: HTMLElement | null
  /** `.partners .mdl-spinner` (legacy `preloader`) */
  preloader: HTMLElement | null
}

export const partnersNodes: PartnersNodes = {
  container: null,
  containerUl: null,
  closeButton: null,
  preloader: null,
}
