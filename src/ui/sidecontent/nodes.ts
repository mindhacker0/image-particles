/**
 * 侧边内容组件渲染的 DOM 节点注册表，思路同 `src/ui/uiNodes.ts`：
 * 组件登记节点，`SideContentFacade.ts` 读取它们。
 */

export interface SideContentNodes {
  /** `.mdl-dialog-back` 遮罩。 */
  back: HTMLElement | null
  /** `dialog.help` 帮助对话框。 */
  helpDialog: HTMLDialogElement | null
}

export const sideContentNodes: SideContentNodes = {
  back: null,
  helpDialog: null
}
