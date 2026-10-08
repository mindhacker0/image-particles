import { legacyApp } from '../../engine/legacyScope'
import { sideContentNodes } from './nodes'
import {
  closeSideContentDialog,
  openSideContentDialog,
  setSideContentState,
  type SideContentDialog,
} from './state'

/**
 * “侧边内容”对话框（帮助 / 应用）的门面。
 *
 * 标记由 `SideContent.tsx` 渲染；本类保持原有公共 API（成员与方法名不变），
 * 改为驱动 `./state.ts`，由组件渲染结果。点击监听仍在此绑定，因为实例由引擎
 * 创建，而非 React。
 */

/** 这里只用到搜索框。 */
interface AppWithSearch {
  search?: { closeAutoComplete(): void }
}

/**
 * 组件持有标记，因此节点优先取自注册表，未命中时回退到选择器。
 */
function resolveElement<T extends Element>(
  fromRegistry: T | null | undefined,
  selector: string,
): T | null {
  return fromRegistry ?? document.querySelector<T>(selector)
}

/** 与 `resolveElement` 相同，用于两个节点列表。 */
function resolveElements(fromRegistry: HTMLElement[], selector: string): HTMLElement[] {
  return fromRegistry.length > 0
    ? fromRegistry
    : Array.from(document.querySelectorAll<HTMLElement>(selector))
}

export class Sidect {
  /** 从未被置为 `true`。 */
  opened = false

  /** `div.pages` 在页面中已不存在，查询结果为 `null`；该类从未使用该成员。 */
  container: Element | null = null
  privacyButton: HTMLElement | null = null
  aboutButton: HTMLElement | null = null
  backDialog: HTMLElement | null = null
  artsAndCultureBtn: HTMLElement | null = null
  experimentMainBtn: HTMLElement | null = null
  /** `openCurrentDialog` / `closeCurrentDialog` 操作的对话框。 */
  currentDialog: HTMLDialogElement | null = null

  constructor() {
    this.container = document.querySelector('div.pages')
    this.privacyButton = resolveElement(null, '#privacybtn')
    this.aboutButton = resolveElement(null, '#aboutbtn')
    this.backDialog = resolveElement(sideContentNodes.back, '.mdl-dialog-back')
    this.artsAndCultureBtn = resolveElement(null, '.header-left .title-arts-culture')
    this.experimentMainBtn = resolveElement(null, '.header-left a.expemain')
    this.artsAndCultureBtn?.addEventListener('click', this.onArtsAndCultureClick.bind(this), false)
    this.backDialog?.addEventListener('click', this.onBackPress.bind(this), false)
  }

  /**
   * 返回对话框对应的 store id；当前实现始终为 `null`。
   */
  private dialogIdOf(dialog: HTMLDialogElement | null): SideContentDialog | null {
    if (!dialog) return null
    return null
  }

  onArtsAndCultureClick(event?: Event): void {
    this.closeSearchAutoComplete()
  }

  /**
   * 关闭搜索联想；本章节标记中没有搜索框，`app.search` 始终为空，
   * 因此该调用是空操作。
   */
  private closeSearchAutoComplete(): void {
    const app = legacyApp() as unknown as AppWithSearch | undefined
    if (app && app.search) app.search.closeAutoComplete()
  }
  popup(url: string, width: number, height: number): void {
    const left = Math.floor((window.innerWidth - width) * 0.5),
      top = Math.floor((window.innerHeight - height) * 0.5)
    window.open(
      url,
      '',
      'top=' +
        top +
        ',left=' +
        left +
        ',width=' +
        width +
        ',height=' +
        height +
        ',menubar=no,scrollbars=no,statusbar=no',
    )
  }

  openCurrentDialog(): void {
    const dialog = this.dialogIdOf(this.currentDialog)
    // 对话框为 `null` 时直接返回，避免报错
    if (!dialog) return

    openSideContentDialog(dialog)

    this.closeSearchAutoComplete()
  }

  closeCurrentDialog(): void {
    closeSideContentDialog()
    this.currentDialog = null
  }

  onBackPress(event?: Event): void {
    this.closeCurrentDialog()
  }

}
