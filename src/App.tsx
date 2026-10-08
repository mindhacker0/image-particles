import { useEffect, useState } from 'react'
import { loadLegacyEngine } from './legacy/loadLegacyEngine'
import { FreefallUi } from './ui/FreefallUi'

type EngineStatus = 'loading' | 'ready' | 'error'

const errorBannerStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 'auto 0 0 0',
  zIndex: 9999,
  padding: '12px 16px',
  font: '13px/1.5 Roboto, Helvetica, sans-serif',
  color: '#fff',
  background: 'rgba(183, 28, 28, .92)',
  whiteSpace: 'pre-wrap',
}

/**
 * React 负责应用外壳。页面结构仍写在 `index.html` 中（UI 代码按类名查找元素），
 * 因此本组件的职责是管理引擎生命周期并展示启动失败信息。
 */
export default function App() {
  const [status, setStatus] = useState<EngineStatus>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const fail = (message: string) => {
      if (!active) return
      setError(message)
      setStatus('error')
    }

    // 引擎的失败可能以未捕获的脚本错误出现，而不一定走 promise，因此两个通道都要
    // 展示到横幅上。第三方脚本（如资源 CDN）的错误只记录日志，不算引擎失败。
    const onError = (event: ErrorEvent) => {
      const source = event.filename || ''
      const isOwnScript = source === '' || source.startsWith(window.location.origin)

      if (!isOwnScript) {
        console.warn('[freefall] third-party script error', source, event.message)
        return
      }

      const message = event.message || 'Uncaught error while starting the legacy engine'
      fail(source ? `${message} (${source})` : message)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      fail(event.reason instanceof Error ? event.reason.message : String(event.reason))
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    loadLegacyEngine()
      .then(() => {
        if (!active) return
        // 脚本加载成功也可能在执行时抛错，因此后续的“加载完成”不应清除已报告的
        // 错误状态。
        setStatus((current) => (current === 'error' ? current : 'ready'))
      })
      .catch((cause: unknown) => {
        fail(cause instanceof Error ? cause.message : String(cause))
      })

    return () => {
      active = false
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  if (status !== 'error') return <FreefallUi />

  return (
    <>
      <FreefallUi />
      <div role="alert" style={errorBannerStyle}>
        <strong>Freefall engine failed to start.</strong>
        {'\n'}
        {error}
      </div>
    </>
  )
}
