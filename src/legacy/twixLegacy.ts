/**
 * 基于 `fetch` 实现的轻量 AJAX 助手，供 UI 使用。
 *
 * 提供 `Twix.ajax`（GET）与 `Twix.post`，返回值支持 `abort()`。
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

/** 执行请求并回调成功 / 失败；返回可 abort 的句柄。 */
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

/** 对外暴露的 ajax / post 接口。 */
export const Twix = {
  ajax: (options: AjaxOptions): LegacyRequest => request(options),
  post: (url: string, data: BodyInit, success?: (body: string) => void): LegacyRequest =>
    request({ type: 'POST', url, data, success }),
}
