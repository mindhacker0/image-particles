import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { uiController } from './controller'
import { FooterNav } from './components/FooterNav'
import { Header } from './components/Header'
import { HelpHints } from './components/HelpHints'
import { Partners } from './partners/Partners'
import { SideContent } from './sidecontent/SideContent'

/**
 * React implementation of the experiment interface.
 *
 * The components own the markup that used to live in `index.html` and render
 * their state from the feature stores in `src/ui/**`. `uiController` is the
 * bridge used by the facades (`ChapterUi`, `Sidect`, `PartnersUi`) so the engine
 * keeps driving the UI through the same API it always had.
 *
 * The interface is portalled into `.cilex-layout` so the header stays a direct
 * child of the MDL layout element, exactly like in the original markup (both
 * Material Design Lite and `css/main.css` rely on that position). The partners
 * panel portals itself into `<body>`, where it used to live.
 */
export function FreefallUi() {
  // The legacy layout owns this mount point, so the React shell renders into
  // it when the page is available and remains renderable during early startup.
  const container = useMemo(
    () => (typeof document === 'undefined' ? null : document.querySelector('.cilex-layout')),
    [],
  )

  useEffect(() => {
    // MDL upgrades the DOM on load, but these nodes are created by React, so the
    // component handler has to be re-run after mounting.
    const componentHandler = (window as unknown as { componentHandler?: { upgradeDom(): void } })
      .componentHandler

    componentHandler?.upgradeDom()
  }, [])

  const ui = (
    <>
      <Header />
      <HelpHints />
      <FooterNav onSpaceToggle={uiController.onSpaceToogleClick} />
      <SideContent />
      <Partners />
    </>
  )

  return container ? createPortal(ui, container) : ui
}
