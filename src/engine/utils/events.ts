/**
 * 观察者模式辅助：事件分发器。
 *
 * `InteractiveObjects` 继承本类，`lod` / `mod` / `LoaderPool` 也会实例化它。
 */

export type Listener = (...args: unknown[]) => void

/** 判断是否为函数。 */
export function isFunction(obj: unknown): boolean {
  return typeof obj === 'function'
}

export class EventDispatcher {
  private readonly listeners = new Map<string, Listener[]>()

  /** 添加监听器。 */
  addListener(label: string, callback: Listener): void {
    if (!this.listeners.has(label)) {
      this.listeners.set(label, [])
    }
    this.listeners.get(label)!.push(callback)
  }

  /** 移除监听器，成功返回 true。 */
  removeListener(label: string, callback: Listener): boolean {
    const listeners = this.listeners.get(label)

    if (listeners && listeners.length) {
      const index = listeners.findIndex((listener) => isFunction(listener) && listener === callback)

      if (index > -1) {
        listeners.splice(index, 1)
        this.listeners.set(label, listeners)
        return true
      }
    }

    return false
  }

  /** 触发事件，有监听器返回 true。 */
  dispatch(label: string, ...args: unknown[]): boolean {
    const listeners = this.listeners.get(label)

    if (listeners && listeners.length) {
      listeners.forEach((listener) => {
        listener(...args)
      })
      return true
    }

    return false
  }
}
