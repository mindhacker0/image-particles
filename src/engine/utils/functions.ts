/**
 *
 * 通用工具函数。
 */

export const supportsPassive = false

/** 写入 cookie；`days` 为可选的有效天数。 */
export function createCookie(name: string, value: string, days?: number): void {
  let expires = ''

  if (days) {
    const date = new Date()
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
    expires = '; expires=' + date.toUTCString()
  }

  document.cookie = name + '=' + value + expires + '; path=/'
}

/** 读取 cookie，不存在时返回 null。 */
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

/** 删除 cookie。 */
export function eraseCookie(name: string): void {
  createCookie(name, '', -1)
}

/** 当前页面 url，去掉特殊字符。 */
export function getCurrentUrl(): string {
  return window.location.href.replace(/[|;$@"'<>?()=+]/g, '')
}

/** 滚轮事件的字段形状（兼容各浏览器的不同属性）。 */
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

/** 把各浏览器形态的滚轮事件归一化为格数与像素滚动量。 */
export function normalizeWheel(event: LegacyWheelEvent): NormalizedWheel {
  let sX = 0
  let sY = 0
  let pX = 0
  let pY = 0

  // 旧式事件字段
  if ('detail' in event) { sY = event.detail as number }
  if ('wheelDelta' in event) { sY = -(event.wheelDelta as number) / 120 }
  if ('wheelDeltaY' in event) { sY = -(event.wheelDeltaY as number) / 120 }
  if ('wheelDeltaX' in event) { sX = -(event.wheelDeltaX as number) / 120 }

  // Firefox 下 DOMMouseScroll 的横向滚动
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
      // delta 以行(LINE)为单位
      pX *= LINE_HEIGHT
      pY *= LINE_HEIGHT
    } else {
      // delta 以页(PAGE)为单位
      pX *= PAGE_HEIGHT
      pY *= PAGE_HEIGHT
    }
  }

  // 无法确定滚动方向时的兜底
  if (pX && !sX) { sX = (pX < 1) ? -1 : 1 }
  if (!sY && event.deltaY) { sY = event.deltaY }

  return { spinX: sX, spinY: sY, pixelX: pX, pixelY: pY }
}
