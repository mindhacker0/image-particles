import { useEffect, useRef, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { getPartnersUi } from './PartnersUi'
import { partnersNodes } from './nodes'
import { usePartnersState } from './state'

/**
 * 伙伴面板：`.partners` 容器、`ul` 列表、关闭按钮和居中的 `mdl-spinner`。
 *
 * 面板通过 portal 渲染到 `<body>`：`FreefallUi` 把界面渲染进 `.cilex-layout`，
 * 而 MDL 给该元素设置了 `position: relative` 与 `overflow-y: auto`，若面板留在
 * 其中，其 `top: 100%` 会在布局内产生滚动区，而不是被 `body` 的
 * `overflow: hidden` 裁剪。
 *
 * 门面实例由 `ChapterUi` 创建，实例出现前面板处于惰性状态
 * （`getPartnersUi()` 为 `null`），因此组件可在引擎启动前安全挂载。
 */
export function Partners() {
  const state = usePartnersState()
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const preloaderRef = useRef<HTMLDivElement>(null)

  // 把事件入口留在组件内，让 JSX 描述意图
  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    getPartnersUi()?.onClose(event)
  }

  useEffect(() => {
    partnersNodes.container = containerRef.current
    partnersNodes.containerUl = listRef.current
    partnersNodes.closeButton = closeButtonRef.current
    partnersNodes.preloader = preloaderRef.current

    // spinner 与浮动按钮都是 MDL 组件且由 React 创建，需让组件处理器识别它们
    // （`FreefallUi` 也会运行 `upgradeDom`；MDL 会跳过已升级的节点，重复运行无副作用）
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
              // 外链统一使用 noreferrer，避免新窗口访问 window.opener
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

      {/* 居中的加载指示器 */}
      <div
        ref={preloaderRef}
        className={`mdl-spinner mdl-js-spinner${state.loading ? ' is-active' : ''}`}
      />
    </div>
  )

  const body = typeof document === 'undefined' ? null : document.body

  return body ? createPortal(panel, body) : panel
}
