import { createLegacyWorker } from '../workers/createLegacyWorker'

/**
 *
 * Loads JSON through a web worker. The worker script itself is untouched: it is
 * bootstrapped through {@link createLegacyWorker} so it has the `Twix` helper its
 * source expects.
 */

export function getUUID(): string {
  function s4(): string {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }

  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

type JsonCallback = (json: unknown) => void

export class JSONLoader {
  private readonly worker: Worker
  private readonly callbacks: Record<string, JsonCallback> = {}
  private readonly onWorkerMessageHandler: (event: MessageEvent) => void

  constructor(workerURL?: string) {
    this.onWorkerMessageHandler = this.onWorkerMessage.bind(this)
    this.worker = createLegacyWorker(workerURL ?? 'works/json_loader.js')
    this.worker.addEventListener('message', this.onWorkerMessageHandler, false)
  }

  load(url: string, callback: JsonCallback): void {
    const uuid = getUUID()
    this.callbacks[uuid] = callback
    this.worker.postMessage({ uuid, url })
  }

  onWorkerMessage(event: MessageEvent): void {
    const uuid = event.data.uuid as string
    const json = event.data.json as unknown
    const callback = this.callbacks[uuid]

    if (callback) {
      callback(json)
      delete this.callbacks[uuid]
    }
  }
}
