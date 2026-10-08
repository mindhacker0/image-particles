import { createLegacyWorker } from '../workers/createLegacyWorker'

/**
 *
 * 通过 web worker 加载 JSON；worker 由 {@link createLegacyWorker} 创建。
 */

/** 生成随机 uuid 字符串。 */
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

  /** 请求加载 url，成功后回调 json。 */
  load(url: string, callback: JsonCallback): void {
    const uuid = getUUID()
    this.callbacks[uuid] = callback
    this.worker.postMessage({ uuid, url })
  }

  /** worker 返回结果后的处理。 */
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
