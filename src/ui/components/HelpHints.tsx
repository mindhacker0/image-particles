import { useEffect, useRef } from 'react'
import { uiNodes } from '../uiNodes'

/**
 * "Help start" hints, moved from `index.html`.
 *
 * The hints are animated by the `ChapterUi` facade with GSAP (the sequence
 * targets the nodes published in `uiNodes.help`), while React owns the markup.
 */
export function HelpHints() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef<HTMLDivElement>(null)
  const artworkRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    uiNodes.help = {
      container,
      tooltips: Array.from(container.querySelectorAll<HTMLElement>('.help-start-tooltip')),
      mouse: mouseRef.current,
      artwork: artworkRef.current,
      mouseWheel: container.querySelector<HTMLElement>('.help-start-mouse-wheel'),
      clickPath: container.querySelector('#help-start-mouse-click'),
    }

    return () => {
      uiNodes.help = null
    }
  }, [])

  return (
    <div ref={containerRef} className="help-start">
      <div style={{ display: 'contents' }}>
        <div className="help-start-tooltip">
          <p>Drag and drop to navigate</p>
        </div>
        <div className="help-start-tooltip">
          <p>Scroll to zoom</p>
        </div>
        <div className="help-start-tooltip">
          <p>Click on an artwork to focus and get more info</p>
        </div>
      </div>

      <div ref={mouseRef} className="help-start-mouse">
        <svg
          version="1.0"
          xmlns="http://www.w3.org/2000/svg"
          x="0px"
          y="0px"
          width="55px"
          height="75px"
          viewBox="-282 362.8 55 75"
          enableBackground="new -282 362.8 55 75"
        >
          <path
            fill="#FFFFFF"
            d="M-251.1,362.8V390h24.1C-227,376-237.5,364.5-251.1,362.8z M-282,410.5c0,15.1,12.3,27.4,27.5,27.4 s27.5-12.2,27.5-27.4v-13.7h-55V410.5z"
          />
          <path
            fill="#FFFFFF"
            id="help-start-mouse-click"
            d="M-257.9,362.8C-271.5,364.5-282,376-282,390h24.1C-257.9,390-257.9,362.8-257.9,362.8z"
          />
        </svg>
        <div className="help-start-mouse-wheel"></div>
      </div>

      <div ref={artworkRef} className="help-start-artwork">
        <svg
          version="1.0"
          id="Layer_1"
          xmlns="http://www.w3.org/2000/svg"
          x="0px"
          y="0px"
          width="117px"
          height="134px"
          viewBox="-247 316 117 134"
          enableBackground="new -247 316 117 134"
        >
          <rect x="-247" y="316" fill="#EAEAEA" width="117" height="134" />
          <path
            fill="#FCFCFC"
            d="M-180,388l-14.1,18.8l10.8,14.2l-6,4.5c-6.4-8.4-17-22.5-17-22.5l-22.6,30h83L-180,388z"
          />
          <g id="Layer_3">
            <polygon
              fill="#C1C1C1"
              points="-156,360.1 -156,384.5 -150.9,379.1 -147.7,385.8 -144.3,383.8 -146.9,377.1 -140,376.9 "
            />
          </g>
        </svg>
      </div>
    </div>
  )
}
