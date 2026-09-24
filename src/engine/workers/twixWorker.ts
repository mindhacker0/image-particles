/**
 * Worker side HTTP helper.
 *
 * The original worker scripts (`js/works/*.js`) called `Twix.ajax` from inside
 * the worker, which cannot reach the page globals: `createLegacyWorker` used to
 * bootstrap a blob worker that defined this helper and then `importScripts` the
 * real script. The ported workers are real modules and import it directly.
 *
 * It is XMLHttpRequest based on purpose (like the blob bootstrap): the original
 * worker code only used `success` / `error` callbacks and `abort()`.
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

export function twixPost(
  url: string,
  data: string,
  success?: (responseText: string) => void,
): TwixRequest {
  return twixAjax({ type: 'POST', url, data, success })
}
