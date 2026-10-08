import { sideContentNodes } from './nodes'
import { closeSideContentDialog, useSideContentState, type SideContentState } from './state'

/**
 * 侧边内容：`.mdl-dialog-back` 遮罩与 `dialog.mdl-dialog` 弹窗。
 *
 * 对话框开关由 `SideContentState` 字段表示，由 `SideContentFacade.ts` 写入。
 */

/**
 * 用 `undefined` 移除 `open` 属性（`open={false}` 仍会渲染出 `open="false"`，
 * 使 `dialog[open]` 命中）。
 */
function dialogOpenAttribute(opened: boolean): true | undefined {
  return opened ? true : undefined
}

/**
 * 对话框由门面通过本 Hook 驱动；组件自身不修改 DOM。
 *
 * 顺序对 CSS 很重要：遮罩在前，对话框在后。
 */
export function SideContent() {
  const state = useSideContentState()

  // 状态变更由父组件负责，子对话框保持纯展示，开关行为在 JSX 中一目了然
  const handleClose = () => closeSideContentDialog()

  return (
    <>
      <DialogBackdrop shown={state.backShown} />
      <HelpDialog state={state} onClose={handleClose} />
    </>
  )
}

/** `.mdl-dialog-back` 遮罩。 */
function DialogBackdrop({ shown }: { shown: boolean }) {
  return (
    <div
      className={`mdl-dialog-back${shown ? ' show' : ''}`}
      ref={(node) => {
        sideContentNodes.back = node
      }}
    />
  )
}

interface HelpDialogProps {
  state: SideContentState
  onClose: () => void
}

function HelpDialog({ state, onClose }: HelpDialogProps) {
  return (
    <dialog
      className={`mdl-dialog help h-recenter${state.helpOpened ? ' open' : ''}`}
      open={dialogOpenAttribute(state.helpOpened)}
      ref={(node) => {
        sideContentNodes.helpDialog = node
      }}
    >
      <h4 className="mdl-dialog__title">Need Help?</h4>
      <div className="mdl-dialog__content">
        <div>
          <i className="material-icons">open_with</i>
          <p>
            Drag to navigate
            <br />
            Use the mouse wheel
            <br />
            to zoom in
          </p>
        </div>
        <div>
          <i className="material-icons">info</i>
          <p>
            Click on an artwork
            <br />
            to get more info
          </p>
        </div>
      </div>
      <div className="mdl-dialog__actions">
        <button type="button" className="mdl-button close" onClick={onClose}>
          close
        </button>
      </div>
    </dialog>
  )
}