/**
 * React 界面渲染出的 DOM 节点注册表。
 *
 * 引擎通过 DOM 元素与界面交互：在按钮上绑定点击、读取 `header_el` 获取章节颜色、
 * 用 GSAP 播放帮助提示。组件把节点登记在这里，`ChapterUi` 门面就能暴露同名成员，
 * 同时由 React 持有标记。
 */

/** 帮助提示用到的节点集合。 */
export interface HelpNodes {
  container: HTMLElement
  tooltips: HTMLElement[]
  mouse: HTMLElement | null
  artwork: HTMLElement | null
  mouseWheel: HTMLElement | null
  clickPath: Element | null
}

/** 界面各区域的 DOM 节点集合。 */
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
