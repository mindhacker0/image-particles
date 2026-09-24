/**
 * Ported from `js/utils/color_utils.js` (colour space and pixel helpers).
 */

/** Converts a hex string to a number, or a number back to a `#rrggbb` string. */
export function convertColor(color: number | string, toNumber?: boolean): number | string {
  if (toNumber === true) {
    if (typeof color === 'number') {
      return (color | 0) // chop off decimal
    }
    if (typeof color === 'string' && color[0] === '#') {
      color = color.slice(1)
    }
    return window.parseInt(color, 16)
  }

  if (typeof color === 'number') {
    // make sure our hexadecimal number is padded out
    color = '#' + ('00000' + (color | 0).toString(16)).substr(-6)
  }
  return color
}

export function rgbToHex(r: number, g: number, b: number): string {
  if (r > 255 || g > 255 || b > 255) {
    throw 'Invalid color component'
  }
  return ((r << 16) | (g << 8) | b).toString(16)
}

/** Reads a rectangular region out of an existing `Uint32Array` pixel buffer. */
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
 * Converts an HSL color value to RGB.
 * Assumes h, s and l are contained in the set [0, 1] and returns r, g and b in
 * the set [0, 255].
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number
  let g: number
  let b: number

  if (s === 0) {
    r = g = b = l // achromatic
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
 * Converts an RGB color value to HSL.
 * Assumes r, g and b are contained in the set [0, 255] and returns h, s and l in
 * the set [0, 1].
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
    h = s = 0 // achromatic
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
