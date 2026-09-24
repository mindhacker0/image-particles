import { twixAjax } from './twixWorker'

/**
 * Ported from `js/works/json_loader.js`.
 *
 * Fetches a JSON document for `JSONLoader` (`src/engine/utils/JSONLoader.ts`).
 * It was a classic script bootstrapped in a blob worker (so it had a `Twix`),
 * it is a module worker now.
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
