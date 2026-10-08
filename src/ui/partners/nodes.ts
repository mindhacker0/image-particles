/**
 * `Partners.tsx` 渲染的 DOM 节点注册表，与 `src/ui/uiNodes.ts` 思路一致：
 * 组件挂载后登记节点、卸载时清空，`PartnersUi` 门面据此暴露
 * `container`、`container_ul`、`close_button` 和 `preloader`。
 */

export interface PartnersNodes {
  /** `.partners` 容器。 */
  container: HTMLElement | null
  /** `.partners ul` 列表。 */
  containerUl: HTMLElement | null
  /** `.partners` 的关闭按钮。 */
  closeButton: HTMLElement | null
  /** `.partners` 的加载指示器。 */
  preloader: HTMLElement | null
}

export const partnersNodes: PartnersNodes = {
  container: null,
  containerUl: null,
  closeButton: null,
  preloader: null,
}
