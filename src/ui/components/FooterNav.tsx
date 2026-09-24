import { useEffect, useRef, type MouseEvent } from 'react'
import { setUiState, useUiState } from '../store'
import { uiNodes } from '../uiNodes'

/**
 * Footer map menu (3D/2D toggle) and the partners link, moved from `index.html`.
 *
 * The original markup had no `.rotation-toggle` button in this page, so only the
 * space toggle is rendered (the `ChapterUi` facade still exposes the rotation
 * methods for the chapters that do have it).
 */

interface FooterNavProps {
  onSpaceToggle: (event: MouseEvent<HTMLButtonElement>) => void
}

export function FooterNav({ onSpaceToggle }: FooterNavProps) {
  const state = useUiState()
  const footerRef = useRef<HTMLDivElement>(null)
  const spaceToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    uiNodes.footerMapNav = footerRef.current
    uiNodes.spaceToggle = spaceToggleRef.current

    return () => {
      uiNodes.footerMapNav = null
      uiNodes.spaceToggle = null
      uiNodes.partnersLink = null
    }
  }, [])

  return (
    <div
      ref={footerRef}
      className={`footer-map-nav${state.footerMapNavShown ? ' show' : ''}`}
    >
      <button
        ref={spaceToggleRef}
        className={`space-toggle${state.threeD ? ' threed' : ''}`}
        onClick={onSpaceToggle}
      >
        <div>
          <span>3D</span>
          <span>2D</span>
        </div>
      </button>
    </div>
  )
}

/** Keeps the 3D/2D label in sync when the chapter changes. */
export function resetThreeDToggle(): void {
  setUiState({ threeD: false })
}
