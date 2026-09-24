/**
 * Ported from `js/utils/event_dispatcher.js` (observer pattern helper).
 *
 * `js/utils/interactive_objects.js` extends this class and `lod.js`, `mod.js`
 * and `LoaderPool.js` instantiate it, so it stays a real class.
 */

export type Listener = (...args: unknown[]) => void

export function isFunction(obj: unknown): boolean {
  return typeof obj === 'function'
}

export class EventDispatcher {
  private readonly listeners = new Map<string, Listener[]>()

  addListener(label: string, callback: Listener): void {
    if (!this.listeners.has(label)) {
      this.listeners.set(label, [])
    }
    this.listeners.get(label)!.push(callback)
  }

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
