import { useEffect, useRef } from 'react'
import { useUiState } from '../store'
import { uiNodes } from '../uiNodes'

/**
 * Header markup, moved from `index.html`.
 *
 * The visibility classes (`.show`, `.opened`, `.selected`, `.is-active`) are
 * rendered from the UI store instead of being toggled with `classList`, and the
 * nodes are published through `uiNodes` for the parts of the engine that still
 * need DOM elements.
 */

const NAV_ITEMS = [
  { seq: 'random', label: 'Big Bang' },
  { seq: 'sphere', label: 'Sphere' },
  { seq: 'wave', label: 'Waves' },
  { seq: 'timeline', label: 'Timeline' },
]

export function Header() {
  const state = useUiState()
  const headerRef = useRef<HTMLElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)

  // publish the nodes the legacy engine expects (`app_freefall.js` binds its
  // click listeners to `ui.buttons`, `main.js` styles `ui.header_el`, ...)
  useEffect(() => {
    uiNodes.header = headerRef.current
    uiNodes.loader = loaderRef.current

    const navs = headerRef.current ? Array.from(headerRef.current.querySelectorAll<HTMLElement>('.nav')) : []
    const buttons = headerRef.current
      ? Array.from(headerRef.current.querySelectorAll<HTMLElement>('.nav li a, .nav li button'))
      : []

    uiNodes.navs = navs
    uiNodes.buttons = buttons

    return () => {
      uiNodes.header = null
      uiNodes.loader = null
      uiNodes.navs = []
      uiNodes.buttons = []
    }
  }, [])

  return (
    <header
      ref={headerRef}
      className={`cilex-header mdl-layout__header bgcolor${state.headerVisible ? ' show' : ''}`}
    >
      <div className="mdl-layout__header-row">

        <div
          ref={loaderRef}
          className={`mdl-spinner mdl-js-spinner search-preloader${state.loading ? ' is-active' : ''}`}
        ></div>

        <div className="nav-chapter">
          <ul className={`nav nav-freefall${state.navsOpened ? ' opened' : ''}`}>
            {NAV_ITEMS.map((item) => (
              <li key={item.seq}>
                <a
                  href={`/${item.seq}`}
                  data-seq={item.seq}
                  className={state.selectedSeq === item.seq ? 'selected' : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mdl-layout-spacer"></div>

      </div>
    </header>
  )
}
