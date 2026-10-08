import { useEffect, useRef, type MouseEvent } from 'react'
import { setUiState, useUiState } from '../store'
import { uiNodes } from '../uiNodes'

/**
 * 底部地图菜单（3D/2D 切换）与伙伴链接。
 *
 * 本页标记没有 `.rotation-toggle` 按钮，因此只渲染空间切换按钮
 * （`ChapterUi` 门面仍保留旋转相关方法，供有此按钮的章节使用）。
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

/** 章节切换时重置 3D/2D 显示状态。 */
export function resetThreeDToggle(): void {
  setUiState({ threeD: false })
}
