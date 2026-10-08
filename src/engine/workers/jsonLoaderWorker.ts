import { twixAjax } from './twixWorker'

/**
 * JSON 加载 worker：为 `JSONLoader`（`src/engine/utils/JSONLoader.ts`）抓取 JSON 文档。
 */

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage(message: unknown): void
}

const worker = self as unknown as WorkerScope

interface JsonLoaderMessage {
  uuid: string
  url: string
}

/** worker 入口：按消息中的 url 抓取 JSON 并回传。 */
worker.onmessage = function (event: MessageEvent) {
  const message = event.data as JsonLoaderMessage
  const uuid = message.uuid
  const url = message.url

  twixAjax({
    url: url,
    success(json) {
      if (typeof json === 'string') {
        json = JSON.parse(json)
      }

      worker.postMessage({
        json: json,
        uuid: uuid,
      })
    },
  })
}
