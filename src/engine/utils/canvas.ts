/**
 *
 * Canvas 相关辅助函数，统一由 `canvasUtils` 对象导出。
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

/** 携带自身 width / height 的 2d 上下文。 */
export type SizedContext = CanvasRenderingContext2D & { width: number; height: number }

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

/** 用给定字体测量文本宽高（含 padding）。 */
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

/** 创建指定尺寸的 canvas 元素。 */
export function create(w: number, h: number): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = w
  element.height = h
  return element
}

/** 获取 2d 上下文，并把 width / height 挂到上下文上。 */
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

/** 把图像绘制到等尺寸的新 canvas 上；图像为空返回 null。 */
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

/** 读取图像的 ImageData；图像为空返回 null。 */
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

/** 按宽度把文本折成多行。 */
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
        // 防止没有空格的长字符串导致死循环
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
 * 在指定的 2d 上下文画布上生成噪声。
 *
 * @param rgba 指定受影响的通道（默认 0）
 * @param min 噪声下界（>= 0）
 * @param max 噪声上界（<= 0xFF）
 */
export function noise(
  context: CanvasRenderingContext2D,
  rgba?: number | null,
  min?: number,
  max?: number,
): void {
  /*
     RGBA 模式，可能取值：

     不透明
     0 : 不透明灰度（白噪声 + 黑色背景）
     1 : 不透明红   （红通道 + 黑色背景）
     2 : 不透明绿   （绿通道 + 黑色背景）
     3 : 不透明红 + 绿
     4 : 不透明蓝   （蓝通道 + 黑色背景）
     5 : 不透明红 + 蓝
     6 : 不透明绿 + 蓝
     7 : 不透明红 + 绿 + 蓝

     透明
     8 : 透明 alpha  （黑色 + 透明背景）
     9 : 透明红      （红通道 + 透明背景）
     10 : 透明绿     （绿通道 + 透明背景）
     11 : 透明红 + 绿
     12 : 透明蓝     （蓝通道 + 透明背景）
     13 : 透明红 + 蓝
     14 : 透明绿 + 蓝
     15 : 透明红 + 绿 + 蓝
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

/** 把 canvas 转成 PNG 的 Blob。 */
export function createImageBlob(canvasElement: HTMLCanvasElement): Blob {
  const extra = ''
  let dataURL = ''
  dataURL += canvasElement.toDataURL('image/png')
  dataURL += extra

  // 转成原始数据
  const data = atob(dataURL.substring('data:image/png;base64,'.length))
  const asArray = new Uint8Array(data.length + extra.length)

  // 转成字节流
  for (let i = 0, len = data.length; i < len; ++i) {
    asArray[i] = data.charCodeAt(i)
  }

  return new Blob([asArray.buffer], { type: 'image/png' })
}

/** RGB 转 `0xrrggbb` 字符串。 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '0x' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

/** 十六进制字符串转 RGB，格式不符返回 null。 */
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

/** 聚合本模块所有函数的导出对象。 */
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
