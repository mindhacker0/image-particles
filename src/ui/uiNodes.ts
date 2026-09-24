/**
 * Registry of the DOM nodes the React UI renders.
 *
 * The not-yet-ported part of the engine (`app_freefall.js`) talks to the UI
 * through DOM elements: it attaches its click listeners to `ui.buttons`, reads
 * `ui.header_el` for the chapter colour and animates the help hints with GSAP.
 * The components publish their nodes here so the `ChapterUi` facade can expose
 * exactly those members while React keeps ownership of the markup.
 */

export interface HelpNodes {
  container: HTMLElement
  tooltips: HTMLElement[]
  mouse: HTMLElement | null
  artwork: HTMLElement | null
  mouseWheel: HTMLElement | null
  clickPath: Element | null
}

export interface UiNodes {
  header: HTMLElement | null
  loader: HTMLElement | null
  navs: HTMLElement[]
  buttons: HTMLElement[]
  triviaPanels: HTMLElement[]
  triviaReup: HTMLElement | null
  partnersLink: HTMLElement | null
  footerMapNav: HTMLElement | null
  spaceToggle: HTMLElement | null
  help: HelpNodes | null
}

export const uiNodes: UiNodes = {
  header: null,
  loader: null,
  navs: [],
  buttons: [],
  triviaPanels: [],
  triviaReup: null,
  partnersLink: null,
  footerMapNav: null,
  spaceToggle: null,
  help: null,
}
