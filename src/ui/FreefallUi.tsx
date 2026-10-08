import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { uiController } from './controller'
import { FooterNav } from './components/FooterNav'
import { Header } from './components/Header'
import { HelpHints } from './components/HelpHints'
import { Partners } from './partners/Partners'
import { SideContent } from './sidecontent/SideContent'

/**
 * 实验界面的 React 实现。
 *
 * 各组件持有标记，并从 `src/ui/**` 的状态仓库渲染自身状态；`uiController`
 * 是各门面（`ChapterUi`、`Sidect`、`PartnersUi`）调用的桥接层。
 *
 * 界面通过 portal 渲染进 `.cilex-layout`，使头部保持为 MDL 布局元素的直接子节点
 * （Material Design Lite 与 `css/main.css` 都依赖这一层级）。伙伴面板则自行
 * portal 到 `<body>`。
 */
export function FreefallUi() {
  // .cilex-layout 由布局持有；页面就绪时渲染进该节点，启动早期也能正常渲染。
  const container = useMemo(
    () => (typeof document === 'undefined' ? null : document.querySelector('.cilex-layout')),
    [],
  )

  useEffect(() => {
    // MDL 在页面加载时升级 DOM，但这些节点由 React 稍后创建，因此挂载后需要重新运行组件处理器。
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
