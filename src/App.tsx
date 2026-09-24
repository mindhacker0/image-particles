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
 * React owns the application shell. The original page markup still lives in
 * `index.html` (the legacy UI code looks it up by class name), so this
 * component's job is the engine lifecycle and surfacing startup failures.
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

    // The legacy engine reports failures as uncaught script errors rather than
    // through promises, so both channels are surfaced in the banner. Errors from
    // third-party scripts (asset CDNs, for example) are only logged: they must
    // not be reported as an engine failure.
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
        // A script can load successfully and still throw while executing, so a
        // reported error must not be cleared by a later "loaded" event.
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
