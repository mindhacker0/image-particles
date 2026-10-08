/** 颜色空间与像素辅助函数。 */

/** 十六进制字符串与数字互转；数字会转成 `#rrggbb` 字符串。 */
export function convertColor(color: number | string, toNumber?: boolean): number | string {
  if (toNumber === true) {
    if (typeof color === 'number') {
      return (color | 0) // 去掉小数部分
    }
    if (typeof color === 'string' && color[0] === '#') {
      color = color.slice(1)
    }
    return window.parseInt(color, 16)
  }

  if (typeof color === 'number') {
    // 补足到 6 位十六进制
    color = '#' + ('00000' + (color | 0).toString(16)).substr(-6)
  }
  return color
}

/** RGB 分量转十六进制字符串。 */
export function rgbToHex(r: number, g: number, b: number): string {
  if (r > 255 || g > 255 || b > 255) {
    throw 'Invalid color component'
  }
  return ((r << 16) | (g << 8) | b).toString(16)
}

/** 从已有的 `Uint32Array` 像素缓冲中读取一块矩形区域。 */
export function getImageDataFaster(
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  H: number,
  d: Uint32Array,
): Uint32Array {
  const arr = new Uint32Array(w * h)
  let i = 0

  for (let r = y; r < h + y; r += 1) {
    for (let c = x; c < w + x; c += 1) {
      const O = (r * W) + c
      if (c < 0 || c >= W || r < 0 || r >= H) {
        arr[i++] = 0
      } else {
        arr[i++] = d[O]
      }
    }
  }

  return arr
}

/**
 * HSL 转 RGB。
 * 假定 h、s、l 在 [0, 1] 区间，返回的 r、g、b 在 [0, 255] 区间。
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number
  let g: number
  let b: number

  if (s === 0) {
    r = g = b = l // 无彩色
  } else {
    const hue2rgb = function hue2rgb(p: number, q: number, t: number) {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * RGB 转 HSL。
 * 假定 r、g、b 在 [0, 255] 区间，返回的 h、s、l 在 [0, 1] 区间。
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0 // 无彩色
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return [h, s, l]
}
