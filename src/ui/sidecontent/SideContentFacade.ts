import { legacyApp } from '../../engine/legacyScope'
import { sideContentNodes } from './nodes'
import {
  closeSideContentDialog,
  openSideContentDialog,
  setSideContentState,
  type SideContentDialog,
} from './state'

/**
 *
 * The legacy class was a constructor function with prototype methods; it looked
 * the dialogs up in `index.html` and mutated them (`setAttribute('open', '')`,
 * `classList.add('show')`, `input.value = ...`). The markup now lives in
 * `SideContent.tsx`, so the class keeps exactly the same public API (member and
 * method names included) but drives `./state.ts` instead of the DOM, and the
 * components render the result. The click listeners are still bound here, like
 * the legacy constructor did, because the class is instantiated by the engine
 * (`js/apps/app_freefall.js` -> `new Sidect()` in `App.setup`), not by React.
 *
 * Port notes
 * ----------
 * - the DOM members are resolved from `./nodes.ts` first (the components
 *   published them) and fall back to the legacy selectors, which still match
 *   because the markup keeps every class name. A missing node is tolerated
 *   instead of throwing (`js/ui/sidect.js` dereferenced the result of
 *   `querySelector` without a check).
 * - the bare globals of the original (`app`, `siteBaseUrl`, `getCurrentUrl`) are
 *   the ported / still shared ones: `legacyApp()` reads the object
 *   `js/apps/app_freefall.js` publishes.
 */

/** only the search box is used here. */
interface AppWithSearch {
  search?: { closeAutoComplete(): void }
}

/**
 * The React components own the markup, so their nodes come from the registry
 * first; the legacy selectors are the fallback (the markup is unchanged, so they
 * still match).
 */
function resolveElement<T extends Element>(
  fromRegistry: T | null | undefined,
  selector: string,
): T | null {
  return fromRegistry ?? document.querySelector<T>(selector)
}

/** Same as `resolveElement`, for the two node lists of the class. */
function resolveElements(fromRegistry: HTMLElement[], selector: string): HTMLElement[] {
  return fromRegistry.length > 0
    ? fromRegistry
    : Array.from(document.querySelectorAll<HTMLElement>(selector))
}

export class Sidect {
  /** never set to `true` by the legacy code either */
  opened = false

  appDialog: HTMLDialogElement | null = null
  /**
   * `div.pages` does not exist in `index.html` anymore (it was already absent
   * from the page when this file was ported), so the lookup returns `null` just
   * like the legacy one did. The class never used the member.
   */
  container: Element | null = null
  privacyButton: HTMLElement | null = null
  aboutButton: HTMLElement | null = null
  backDialog: HTMLElement | null = null
  artsAndCultureBtn: HTMLElement | null = null
  experimentMainBtn: HTMLElement | null = null
  /** the dialog `openCurrentDialog` / `closeCurrentDialog` work on */
  currentDialog: HTMLDialogElement | null = null

  constructor() {
    this.appDialog = resolveElement(sideContentNodes.appDialog, 'dialog.app')
    //this.creditsDialog = document.querySelector('dialog.credits');
    this.container = document.querySelector('div.pages')
    //this.creditsButton = document.querySelector('#credits-dialog');
    this.privacyButton = resolveElement(null, '#privacybtn')
    this.aboutButton = resolveElement(null, '#aboutbtn')
    //this.artExperimentButton = document.querySelector('#artexbtn');
    this.backDialog = resolveElement(sideContentNodes.back, '.mdl-dialog-back')
    this.artsAndCultureBtn = resolveElement(null, '.header-left .title-arts-culture')
    this.experimentMainBtn = resolveElement(null, '.header-left a.expemain')
    //this.experimentReloadBtn = document.querySelector('.header-left a.expereload');
    //this.creditsButton.addEventListener('click', this.onCredits.bind(this));
    // this.appButton.addEventListener('click', this.onApp.bind(this));
    //this.artExperimentButton.addEventListener('click', this.onArtExperiments, false);
    this.artsAndCultureBtn?.addEventListener('click', this.onArtsAndCultureClick.bind(this), false)
    //this.experimentReloadBtn.addEventListener('click', this.onExperimentReloadClick.bind(this), false);
    this.backDialog?.addEventListener('click', this.onBackPress.bind(this), false)
    //this.creditsDialog.querySelector('.close').addEventListener('click', this.onCloseCredits.bind(this));
    this.appDialog?.querySelector('.close')?.addEventListener('click', this.onCloseApp.bind(this))

  }

  /**
   * The legacy `opened` / `currentDialog` pair identifies which dialog is open;
   * the store needs to know which one it is.
   */
  private dialogIdOf(dialog: HTMLDialogElement | null): SideContentDialog | null {
    if (!dialog) return null
    if (dialog === this.appDialog) return 'app'
    return null
  }

  onArtsAndCultureClick(event?: Event): void {
    this.closeSearchAutoComplete()
  }

  /**
   * `if(app && app.search) app.search.closeAutoComplete();` of the original. The
   * search box is gone from this chapter's markup, so `app.search` is never set
   * and the call is a no-op - the guard is what keeps it working.
   */
  private closeSearchAutoComplete(): void {
    const app = legacyApp() as unknown as AppWithSearch | undefined
    if (app && app.search) app.search.closeAutoComplete()
  }
  popup(url: string, width: number, height: number): void {
    //if (Modernizr.desktop) {
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
    /*} else {
        window.open(url, '_blank');
    }*/
  }

  openCurrentDialog(): void {
    const dialog = this.dialogIdOf(this.currentDialog)
    // the legacy code called `setAttribute` on the (possibly null) member and
    // threw; a dialog is always assigned before this call in practice
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

  onCloseApp(event?: Event): void {
    this.closeCurrentDialog()
  }
}
