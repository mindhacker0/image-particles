import { useEffect, useRef, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { getPartnersUi } from './PartnersUi'
import { partnersNodes } from './nodes'
import { usePartnersState } from './state'

/**
 *
 * The markup the legacy class created and mutated: the `.partners` panel with
 * its `ul`, the close button (`mdl-button mdl-js-button mdl-button--fab
 * mdl-js-ripple-effect bgcolor`) and the centered `mdl-spinner`. The classes and
 * the DOM order are the ones of `index.html` so `css/main.css` keeps applying;
 * the `.open` / `.show` / `.is-active` toggles and the two inline styles of
 * `partners_ui.js` (`resize`) are rendered from `state.ts` instead.
 *
 * The panel keeps the position it had in the original page — a direct child of
 * `<body>` — hence the portal: `FreefallUi` renders the interface inside
 * `.cilex-layout`, and MDL gives that element `position: relative` plus
 * `overflow-y: auto`, so the closed panel (`top: 100%`, height = the window
 * height) would resolve against, and add a scroll area to, the layout instead of
 * being clipped by `body` (`html, body { overflow: hidden }` in `css/main.css`).
 *
 * `FreefallUi` must render `<Partners />` once, after `<FooterNav />` (the panel
 * comes last in the original markup). The instance of the facade is created by
 * `ChapterUi`; until it exists the markup is inert (`getPartnersUi()` is null),
 * which is also why the component is safe to mount before the engine boots.
 */
export function Partners() {
  const state = usePartnersState()
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const preloaderRef = useRef<HTMLDivElement>(null)

  // Keep the event boundary in the component so the JSX describes intent
  // rather than reaching into the legacy facade inline.
  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    getPartnersUi()?.onClose(event)
  }

  useEffect(() => {
    partnersNodes.container = containerRef.current
    partnersNodes.containerUl = listRef.current
    partnersNodes.closeButton = closeButtonRef.current
    partnersNodes.preloader = preloaderRef.current

    // the spinner and the fab button are MDL components created by React, so the
    // component handler has to see them (`FreefallUi` runs `upgradeDom` too;
    // MDL skips the nodes it already upgraded, so running it twice is a no-op)
    const componentHandler = (window as unknown as { componentHandler?: { upgradeDom(): void } })
      .componentHandler

    componentHandler?.upgradeDom()

    return () => {
      partnersNodes.container = null
      partnersNodes.containerUl = null
      partnersNodes.closeButton = null
      partnersNodes.preloader = null
    }
  }, [])

  const panel = (
    <div
      ref={containerRef}
      className={`partners${state.partnersOpened ? ' open' : ''}`}
      style={{ height: state.panelHeight }}
    >
      <ul ref={listRef} style={{ marginLeft: state.listMarginLeft }}>
        {state.partners.map((entry) => (
          <li key={entry.url}>
            <a
              href={entry.href}
              target="_blank"
              // the original link had no `rel` (a `target="_blank"` window could
              // reach `window.opener`); the other external links of the port use
              // `noreferrer`, so this one does too
              rel="noreferrer"
            >
              <img src={entry.imageUrl} alt={entry.title} />
            </a>
          </li>
        ))}
      </ul>

      <button
        ref={closeButtonRef}
        className="mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect bgcolor"
        onClick={handleClose}
      >
        <i className="material-icons">close</i>
      </button>

      {/* centered preloader */}
      <div
        ref={preloaderRef}
        className={`mdl-spinner mdl-js-spinner${state.loading ? ' is-active' : ''}`}
      />
    </div>
  )

  const body = typeof document === 'undefined' ? null : document.body

  return body ? createPortal(panel, body) : panel
}
