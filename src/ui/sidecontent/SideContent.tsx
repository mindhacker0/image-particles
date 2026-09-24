import { sideContentNodes } from './nodes'
import { closeSideContentDialog, useSideContentState, type SideContentState } from './state'

/**
 *
 * The side content of the page: the item detail panel of the original experiment
 * is not part of `js/ui/sidect.js` in this snapshot (see `state.ts`), so this
 * module is the markup the class drove - the `.mdl-dialog-back` backdrop and the
 * `dialog.mdl-dialog` popin - moved out of `index.html` verbatim (every
 * class name is kept, so `css/main.css` still applies).
 *
 * The legacy class opened the dialogs with `setAttribute('open', '')` and added
 * `.show` to the backdrop. Those are `SideContentState` fields now, written by
 * `SideContentFacade.ts`.
 */

/** React renders `open={false}` as `open="false"`, which matches `dialog[open]`. */
function dialogOpenAttribute(opened: boolean): true | undefined {
  return opened ? true : undefined
}

/**
 * `Sidect.openCurrentDialog` / `closeCurrentDialog` drive the components through
 * this hook; the components never mutate the DOM themselves.
 *
 * Order matters for the CSS: the backdrop comes first, then the dialogs.
 */
export function SideContent() {
  const state = useSideContentState()

  // The parent owns the state transition. Child dialogs stay presentational,
  // which makes their open/close behavior explicit in the JSX tree.
  const handleClose = () => closeSideContentDialog()

  return (
    <>
      <DialogBackdrop shown={state.backShown} />
      <HelpDialog state={state} onClose={handleClose} />
    </>
  )
}

/** `.mdl-dialog-back` */
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