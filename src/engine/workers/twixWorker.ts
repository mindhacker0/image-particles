/**
 * worker 侧 HTTP 辅助函数。
 *
 * 故意使用 XMLHttpRequest：worker 中的调用方只用到 `success` / `error` 回调和
 * `abort()`。
 */

export interface TwixRequestOptions {
  type?: string
  url: string
  data?: string
  success?: (responseText: string) => void
  error?: (status: number) => void
}

export interface TwixRequest {
  abort(): void
}

/** 发起 XHR 请求，返回可 abort 的句柄。 */
export function twixAjax(options: TwixRequestOptions): TwixRequest {
  const xhr = new XMLHttpRequest()

  xhr.open(options.type || 'GET', options.url, true)

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return

    if (xhr.status >= 200 && xhr.status < 300) {
      if (options.success) options.success(xhr.responseText)
    } else if (options.error) {
      options.error(xhr.status)
    }
  }

  xhr.send(options.data || undefined)

  return {
    abort() {
      xhr.abort()
    },
  }
}

/** 以 POST 方式发起请求。 */
export function twixPost(
  url: string,
  data: string,
  success?: (responseText: string) => void,
): TwixRequest {
  return twixAjax({ type: 'POST', url, data, success })
}
