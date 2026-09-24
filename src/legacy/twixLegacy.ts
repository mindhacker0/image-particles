/**
 * The legacy build loaded a `twix.min.js` vendor file that only existed in the
 * original deployment. The npm package named `twix` is unrelated (it is a
 * Moment.js date-range plugin), so the small AJAX surface the UI uses is
 * reimplemented here on top of `fetch`.
 *
 * Used by:
 *   js/ui/partners_ui.js  -> Twix.ajax({ type: 'GET', url, success })
 *   js/ui/sidect.js       -> Twix.post(url, data, success) and .abort()
 */

interface AjaxOptions {
  type?: string
  url: string
  data?: BodyInit
  success?: (body: string) => void
  error?: (status: number) => void
}

export interface LegacyRequest {
  abort: () => void
}

function request(options: AjaxOptions): LegacyRequest {
  const { type = 'GET', url, data, success, error } = options
  const controller = new AbortController()

  void fetch(url, { method: type, body: data, signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      return response.text()
    })
    .then((body) => success?.(body))
    .catch((cause: unknown) => {
      if ((cause as { name?: string }).name === 'AbortError') return
      console.error('[twix] request failed', url, cause)
      error?.(0)
    })

  return { abort: () => controller.abort() }
}

export const Twix = {
  ajax: (options: AjaxOptions): LegacyRequest => request(options),
  post: (url: string, data: BodyInit, success?: (body: string) => void): LegacyRequest =>
    request({ type: 'POST', url, data, success }),
}
