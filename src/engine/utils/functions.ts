/**
 *
 * The original classic script declared these helpers in the global scope; the
 * exported names are published through `src/engine/install.ts` so the remaining
 * classic scripts keep working unchanged.
 */

export const supportsPassive = false

/**
 * Restores the `Function.prototype.subclass` helper the legacy bundle installed
 * for its prototype based inheritance.
 */
export function installFunctionSubclass(): void {
  const prototype = Function.prototype as unknown as Record<string, unknown>
  if (typeof prototype.subclass === 'function') return

  type NonConstructor = { new (): unknown; prototype: unknown }

  const nonconstructor = function () {} as unknown as NonConstructor

  const subclass = function (this: { prototype: unknown }, base: { prototype: unknown }) {
    nonconstructor.prototype = base.prototype
    this.prototype = new nonconstructor()
  } as unknown as Record<string, unknown> & ((base: unknown) => void)

  subclass.nonconstructor = nonconstructor
  prototype.subclass = subclass
}

export function createCookie(name: string, value: string, days?: number): void {
  let expires = ''

  if (days) {
    const date = new Date()
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
    expires = '; expires=' + date.toUTCString()
  }

  document.cookie = name + '=' + value + expires + '; path=/'
}

export function readCookie(name: string): string | null {
  const nameEQ = name + '='
  const chunks = document.cookie.split(';')

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i]
    while (chunk.charAt(0) === ' ') chunk = chunk.substring(1, chunk.length)
    if (chunk.indexOf(nameEQ) === 0) return chunk.substring(nameEQ.length, chunk.length)
  }

  return null
}

export function eraseCookie(name: string): void {
  createCookie(name, '', -1)
}

export function getCurrentUrl(): string {
  return window.location.href.replace(/[|;$@"'<>?()=+]/g, '')
}

/** Shape of the wheel events the legacy code inspects. */
export interface LegacyWheelEvent {
  detail?: number
  wheelDelta?: number
  wheelDeltaX?: number
  wheelDeltaY?: number
  axis?: number
  HORIZONTAL_AXIS?: number
  deltaX?: number
  deltaY?: number
  deltaMode?: number
}

export interface NormalizedWheel {
  spinX: number
  spinY: number
  pixelX: number
  pixelY: number
}

const PIXEL_STEP = 10
const LINE_HEIGHT = 40
const PAGE_HEIGHT = 800

export function normalizeWheel(event: LegacyWheelEvent): NormalizedWheel {
  let sX = 0
  let sY = 0
  let pX = 0
  let pY = 0

  // Legacy
  if ('detail' in event) { sY = event.detail as number }
  if ('wheelDelta' in event) { sY = -(event.wheelDelta as number) / 120 }
  if ('wheelDeltaY' in event) { sY = -(event.wheelDeltaY as number) / 120 }
  if ('wheelDeltaX' in event) { sX = -(event.wheelDeltaX as number) / 120 }

  // side scrolling on FF with DOMMouseScroll
  if ('axis' in event && event.axis === event.HORIZONTAL_AXIS) {
    sX = sY
    sY = 0
  }

  pX = sX * PIXEL_STEP
  pY = sY * PIXEL_STEP

  if ('deltaY' in event) { pY = event.deltaY as number }
  if ('deltaX' in event) { pX = event.deltaX as number }

  if ((pX || pY) && event.deltaMode) {
    if (event.deltaMode === 1) {
      // delta in LINE units
      pX *= LINE_HEIGHT
      pY *= LINE_HEIGHT
    } else {
      // delta in PAGE units
      pX *= PAGE_HEIGHT
      pY *= PAGE_HEIGHT
    }
  }

  // Fall-back if spin cannot be determined
  if (pX && !sX) { sX = (pX < 1) ? -1 : 1 }
  if (!sY && event.deltaY) { sY = event.deltaY }

  return { spinX: sX, spinY: sY, pixelX: pX, pixelY: pY }
}
