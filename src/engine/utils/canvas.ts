/**
 *
 * The original exposed the members through a single `canvasUtils` global, which
 * `js/atlas/dateLabels.js` still reads as `canvasUtils.measureText(...)`.
 */

export interface LabelFont {
  color: string
  size: number
  type: string
}

export interface TextMeasure {
  w: number
  h: number
}

/** 2d context that also carries its own width / height, as the legacy code sets them. */
export type SizedContext = CanvasRenderingContext2D & { width: number; height: number }

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

export function measureText(text: string, font: LabelFont, padding: number): TextMeasure {
  ctx.save()
  ctx.fillStyle = font.color
  ctx.font = font.size + 'px ' + font.type

  const textWidth = ctx.measureText(text).width
  const w = textWidth + padding * 2
  const h = font.size + padding * 2
  ctx.restore()

  return { w: Math.ceil(w), h: Math.ceil(h) }
}

export function create(w: number, h: number): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = w
  element.height = h
  return element
}

export function getContext(
  target?: HTMLCanvasElement,
  w?: number,
  h?: number,
): SizedContext {
  const element = target || create(w as number, h as number)
  element.width = w || element.width
  element.height = h || element.height

  const context = element.getContext('2d') as SizedContext
  context.width = element.width
  context.height = element.height
  return context
}

export function fromImage(image: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement | null {
  if (!image) {
    console.warn('The image provide is null or undefined.')
    return null
  }

  const element = document.createElement('canvas')
  element.width = image.width
  element.height = image.height

  const context = element.getContext('2d') as SizedContext
  context.width = image.width
  context.height = image.height
  context.drawImage(image, 0, 0)

  return element
}

export function getImageData(
  image: CanvasImageSource & { width: number; height: number },
): ImageData | null {
  if (!image) {
    console.warn('The image provide is null or undefined.')
    return null
  }

  const element = fromImage(image) as HTMLCanvasElement
  return (element.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, image.width, image.height)
}

export function chopMultilineText(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const textArr = text.split(' ')
  const lines: string[] = []
  let tmp = ''
  let line = ''

  for (let i = 0; i < textArr.length; i++) {
    tmp += textArr[i] + ' '

    if (context.measureText(tmp).width >= width) {
      if (line === '') {
        // prevent long string without space that lead to an infinity loop
        line = tmp.substr(0, tmp.length - 1)
        let j = line.length + 1
        while (j--) {
          tmp = line.substr(0, j)
          if (context.measureText(tmp).width <= width) {
            lines.push(tmp)
            textArr.splice(i + 1, 0, line.substr(j))
            break
          }
        }
      } else {
        lines.push(line.substr(0, line.length - 1))
        i--
      }
      tmp = ''
      line = ''
    } else {
      line = tmp
    }
  }

  if (line) {
    lines.push(line)
  }

  return lines
}

/**
 * Creates a noise on the specified 2d context's canvas.
 *
 * @param rgba color code specifying which channels are affected (default = 0)
 * @param min noise lower bound (>= 0)
 * @param max noise upper bound (<= 0xFF)
 */
export function noise(
  context: CanvasRenderingContext2D,
  rgba?: number | null,
  min?: number,
  max?: number,
): void {
  /*
     RGBA mode. possible values

     OPAQUE
     0 : opaque greyscale ( white noise + black background )
     1 : opaque red    ( red channel + black background )
     2 : opaque green  ( green channel + black background )
     3 : opaque red + green
     4 : opaque blue   ( blue channel + black background )
     5 : opaque red + blue
     6 : opaque green + blue
     7 : opaque red + green + blue

     TRANSPARENT
     8 : transparent alpha    ( black + transparent background )
     9 : transparent red      ( red channel + transparent background )
     10 : transparent green    ( green channel + transparent background )
     11 : transparent red + green
     12 : transparent blue     ( blue channel + transparent background )
     13 : transparent red + blue
     14 : transparent green + blue
     15 : transparent red + green + blue
  */
  if (rgba == null) rgba = 0

  const r = (rgba & 1) !== 0
  const g = (rgba & 2) !== 0
  const b = (rgba & 4) !== 0

  let rv = r ? 1 : 0
  let gv = g ? 1 : 0
  let bv = b ? 1 : 0

  const color = !(!r && !g && !b)

  const alpha = (rgba & 8) !== 0
  let alphaDiv = rv + gv + bv
  if (alphaDiv === 0) alphaDiv = 1

  min = min || 0
  max = max || 0xff
  const delta = max - min

  const img = context.getImageData(0, 0, context.canvas.width, context.canvas.height)
  const data = img.data

  for (let i = 0; i < data.length; i += 4) {
    if (!color) {
      const val = min + parseInt(String(Math.random() * delta), 10)
      data[i] = data[i + 1] = data[i + 2] = val
    } else {
      if (r) rv = data[i] = min + parseInt(String(Math.random() * delta), 10)
      if (g) gv = data[i + 1] = min + parseInt(String(Math.random() * delta), 10)
      if (b) bv = data[i + 2] = min + parseInt(String(Math.random() * delta), 10)
    }

    if (alpha) {
      if (color) {
        data[i + 3] = parseInt(String((rv + gv + bv) / alphaDiv), 10)
      } else {
        data[i + 3] = parseInt(String(Math.random() * 0xff), 10)
      }
    } else {
      data[i + 3] = 255
    }
  }

  context.putImageData(img, 0, 0)
}

export function createImageBlob(canvasElement: HTMLCanvasElement): Blob {
  const extra = ''
  let dataURL = ''
  dataURL += canvasElement.toDataURL('image/png')
  dataURL += extra

  // turn it into raw data
  const data = atob(dataURL.substring('data:image/png;base64,'.length))
  const asArray = new Uint8Array(data.length + extra.length)

  // turns it into a byte stream
  for (let i = 0, len = data.length; i < len; ++i) {
    asArray[i] = data.charCodeAt(i)
  }

  return new Blob([asArray.buffer], { type: 'image/png' })
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '0x' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

/** Object shape published as the legacy `canvasUtils` global (same members as the original). */
export const canvasUtils = {
  measureText,
  create,
  getContext,
  fromImage,
  getImageData,
  chopMultilineText,
  noise,
  createImageBlob,
}
