/**
 *
 * 模型数据层：整个应用共享的数据表（`Model.items`，保存标题、图片地址、年份、
 * tsne / rasterfairy / 颜色等属性）以及填充该表的辅助函数。
 *
 * 各属性由对应图片逐像素解析写入（`data/rasterfairy.png`、`data/timeline.png`、
 * `data/colors.png`、`data/heightmap.png`、`data/tsne.bin`）；`atlas` 由
 * `src/engine/Main.ts` 持有，因此统一通过 `src/engine/legacyScope.ts` 的访问器读取。
 */
import { Vector2 } from 'three'
import type { Asset } from '../atlas/Asset'
import { atlasInstance } from '../legacyScope'
import { convertColor, rgbToHex } from '../utils/color'
import { createLegacyWorker } from '../workers/createLegacyWorker'

/** 数据表 `Model.items` 中的一条条目。 */
export interface ModelItem {
  id?: string
  title?: string
  image_url?: string
  /** 由 `updateItem`（unix 秒 → Date）或日期解析流程写入 */
  date_created?: Date | null
  /** 年份，由日期解析流程写入 */
  year?: number | null
  /** 条目填充完成后由 `updateItem` 置位 */
  updated?: boolean
  rasterfairy_index?: number | null
  rasterfairy_x?: number
  rasterfairy_y?: number
  color_hue?: number | null
  color_bri?: number | null
  tsne_x?: number
  tsne_y?: number
  tsne_z?: number
  [key: string]: unknown
}

/** 共享数据表；下面的 `Model.items` 与之是同一个对象。 */
export const items: Record<string, ModelItem> = {}

export const Model: { items: Record<string, ModelItem> } = { items }

export const propertyIdRasterfairy = 'rasterfairy'
export const propertyIdDates = 'dates'
export const propertyIdTsne = 'tsne'
export const propertyIdColors = 'colors'

export let rasterfairySizeMaxWidth = 0
export let rasterfairySizeMaxHeight = 0
export const itemsPropertiesLoaded: Record<string, boolean> = {}
export const itemsPropertiesOnLoading: Record<string, boolean> = {}

/** 数据请求 worker：把旧脚本路径映射到 Vite 打包后的模块 worker。 */
export const worker = createLegacyWorker('works/models.js')

/** 发送给数据 worker 的请求选项。 */
interface ModelRequestOptions {
  type?: string
  assetId?: string
  data?: unknown
  fromAllChannels?: boolean
  results?: string[]
  [key: string]: unknown
}

/** 数据 worker 回传的消息。 */
interface ModelWorkerMessage {
  type: string
  uuid: string
  json: unknown
  opts: ModelRequestOptions
}

/**
 * `Dates` 消息会被路由到这里，但页面从不发送该消息（只有 worker 定义了该类型），
 * 因此该分支不可达。下面是环境声明，不产生任何代码，真正调用仍会抛 ReferenceError。
 */
declare function onDates(data: ModelWorkerMessage): void

/**
 * 请求回调表：以请求 uuid 为键，四个属性加载器除外（用属性 id：`rasterfairy`、
 * `dates`、`tsne`、`colors`）。
 */
type ModelCallback = (...args: unknown[]) => void

export const cbs: Record<string, ModelCallback | undefined> = {}

worker.addEventListener('message', function (event: MessageEvent) {
  const data = event.data as ModelWorkerMessage

  switch (data.type) {
    case 'Items':
      onItems(data)
      break
    case 'Item':
      onItem(data)
      break
    case 'AutocompleteList':
      onAutocompleteList(data)
      break
    case 'Search':
    case 'SearchByArtistName':
    case 'SearchByArtistId':
    case 'SearchByPartnerId':
      onSearch(data)
      break
    case 'Images':
      onImages(data)
      break
    case 'Dates':
      onDates(data)
      break
  }
})

/** 生成随机 uuid 字符串。 */
export function guid(): string {
  function s4(): string {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4()
}

/** 读取单条条目：命中缓存则立即回调，否则向 worker 请求。 */
export function getItem(assetId: string, callback: (item: ModelItem) => void): void {
  if (Model.items[assetId] && Model.items[assetId]['updated'])
    callback(Model.items[assetId])
  else {
    const uuid = guid()
    cbs[uuid] = callback
    worker.postMessage({ type: 'Item', uuid, opts: { assetId } })
  }
}

/** worker 返回单条条目后的处理：写入数据表并回调。 */
export function onItem(data: ModelWorkerMessage): void {
  const cb = cbs[data.uuid]
  updateItem(data.opts.assetId as string, data.json as Record<string, unknown>)
  cb(items[data.opts.assetId as string])
  delete cbs[data.uuid]
}

/** 批量读取条目：向 worker 请求并按返回结果更新数据表。 */
export function getItems(ids: string[], callback: (items: ModelItem[]) => void): void {
  const uuid = guid()
  cbs[uuid] = callback

  worker.postMessage({
    type: 'Items',
    uuid,
    opts: {
      type: 'POST',
      data: ids,
    },
  })
}

/** 将 worker 返回的字段写入数据表；`date_created` 会转成 `Date`。 */
export function updateItem(id: string, data: Record<string, unknown>): void {
  if (!Model.items[id]) { Model.items[id] = {} }
  for (const prop in data) {
    if (prop === 'date_created') {
      // 后端返回的时间戳是字符串，`parseInt` 两种情况都能处理
      Model.items[id].date_created = (data.date_created) ? new Date(parseInt(data.date_created as string) * 1000) : null
    } else {
      Model.items[id][prop] = data[prop]
    }
  }

  Model.items[id]['updated'] = true
}

/** worker 返回批量条目后的处理：逐条写入数据表并回调。 */
export function onItems(data: ModelWorkerMessage): void {
  const json = data.json as ModelItem[]
  const cb = cbs[data.uuid]
  for (let i = 0; i < json.length; i++)
    updateItem(json[i].id as string, json[i])

  cb(json)
  delete cbs[data.uuid]
}

/** 批量读取图片地址：向 worker 请求并回填数据表，返回 id → url 映射。 */
export function getImages(
  ids: string,
  fromAllChannels: boolean | undefined,
  results: string[],
  callback: (urls: Record<string, string>) => void,
): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'Images', uuid, opts: {
      type: 'POST',
      data: ids,
      fromAllChannels,
      results,
    },
  })
}

/** worker 返回图片地址后的处理：回填数据表并回调。 */
export function onImages(data: ModelWorkerMessage): void {
  const json = data.json as { id: string; u: string }[]
  const results = data.opts.results as string[]
  const cb = cbs[data.uuid]
  // 把图片地址回填到共享数据表
  for (let i = 0; i < json.length; i++) {
    const mid = json[i]['id']
    const url = json[i]['u']
    Model.items[mid].image_url = url
  }

  const dict: Record<string, string> = {}
  for (const mid of results) {
    dict[mid] = Model.items[mid].image_url as string
  }
  cb(dict)
  // 与 `onItem` / `onItems` 不同，这里不删除 `cbs[data.uuid]`，回调会一直留在注册表里；
  // 因为每次都用新的 uuid 调用，实际没有影响。
}

// -------------------- 搜索调用 ------------------------
// 全局搜索
export function getSearch(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'Search', uuid, opts: {
      search,
    },
  })
}
// 按艺术家名称搜索
export function getSearchByArtistName(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'SearchByArtistName', uuid, opts: {
      search,
    },
  })
}
export function getSearchByArtistId(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'SearchByArtistId', uuid, opts: {
      search,
    },
  })
}
// 按合作方 id 搜索
export function getSearchByPartnerId(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'SearchByPartnerId', uuid, opts: {
      search,
    },
  })
}

// ----- 搜索返回 ------
export function onSearch(data: ModelWorkerMessage): void {
  const json = data.json as { items?: { id: string; title: string; img: string }[]; totalCount: number }
  const jsonItems = json.items
  const totalCount = json.totalCount
  const resp: Record<string, ModelItem> = {}
  if (!jsonItems) {
    // 直接按 uuid 取回调，未知 uuid 会抛错
    cbs[data.uuid]({}, 0)
    // 这条提前返回和下面的正常路径都不删除 `cbs[data.uuid]`
    return
  }
  for (let i = 0; i < jsonItems.length; i++) {
    const mid = jsonItems[i].id
    // 更新缓存数据表中的条目
    Model.items[mid] = Model.items[mid] || {}
    Model.items[mid]['id'] = jsonItems[i].id
    Model.items[mid]['title'] = jsonItems[i].title
    Model.items[mid]['image_url'] = jsonItems[i].img
    resp[mid] = Model.items[mid]
  }
  const cb = cbs[data.uuid]

  cb(resp, totalCount)
}

// -------- 自动补全 ----------
/** 请求自动补全列表。 */
export function getAutocompleteList(callback: (json: unknown) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({ type: 'AutocompleteList', uuid, opts: {} })
}

/** 自动补全列表返回后的处理。 */
export function onAutocompleteList(data: ModelWorkerMessage): void {
  cbs[data.uuid](data.json)
  // 这里同样不删除 `cbs[data.uuid]`
}

/**** ---------- 由图片解析属性 ---------- *****/

/** 通过共享访问器获取 `atlas` 中用到的属性。 */
interface LegacyAtlas {
  assets: Asset[]
  skipAnimation(): void
}

function legacyAtlas(): LegacyAtlas {
  return atlasInstance() as unknown as LegacyAtlas
}

/** `convertColor(hex, true)` 返回数字，此处收窄类型。 */
function hexToNumber(hex: string): number {
  return convertColor(hex, true) as number
}

/**
 * `getTsne` 会用到 `ImageTsneFormula`，但本项目未定义它：下面是环境声明，
 * 不产生任何代码，运行到仍会抛 ReferenceError（`getTsne` 目前也未被调用）。
 */
declare const ImageTsneFormula: {
  ctx?: unknown
  heightMapData?: Uint8ClampedArray
  heightMapWidth?: number
  heightMapHeight?: number
  getHeightAt?(x: number, y: number): number
}

/** 从 `data/rasterfairy.png` 解析 rasterfairy 索引与网格坐标（每个像素对应一个资源）。 */
export function getRasterfairy(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdRasterfairy]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdRasterfairy] = callback

  if (itemsPropertiesOnLoading[propertyIdRasterfairy]) return

  itemsPropertiesOnLoading[propertyIdRasterfairy] = true

  const imageObj = new Image()

  imageObj.onload = function (this: HTMLImageElement) {
    const imageW = imageObj.width, imageH = imageObj.height
    const canvas = document.createElement('canvas')
    canvas.id = 'tsneindexes'
    canvas.width = imageW
    canvas.height = imageH

    const context = canvas.getContext('2d')
    context.drawImage(this, 0, 0)
    const pixelData = context.getImageData(0, 0, imageW, imageH)

    let hex = ''
    let index = 0
    let parsingIndex = 0

    const rasterfairySize = 440

    let x_raster = 0
    let y_raster = 0
    let i = 0
    let asset: Asset | null = null
    let item: ModelItem | null = null

    const assets = legacyAtlas().assets

    for (let y = 0; y < pixelData.height; y++) {
      for (let x = 0; x < pixelData.width; x++) {
        parsingIndex = (x + y * imageW) * 4
        asset = assets[i]

        hex = '#' + ('000000' + rgbToHex(pixelData.data[parsingIndex], pixelData.data[parsingIndex + 1], pixelData.data[parsingIndex + 2])).slice(-6)
        index = hexToNumber(hex)

        if (index > 0) {
          index -= 1
          if (asset) {
            item = Model.items[asset.id]
            y_raster = Math.floor(index / rasterfairySize)
            x_raster = index - y_raster * rasterfairySize
            item['rasterfairy_index'] = index
            item['rasterfairy_x'] = x_raster
            item['rasterfairy_y'] = y_raster
            rasterfairySizeMaxWidth = Math.max(x_raster, rasterfairySizeMaxWidth)
            rasterfairySizeMaxHeight = Math.max(y_raster, rasterfairySizeMaxHeight)
          }
        } else if (asset) {
          item = Model.items[asset.id]
          item['rasterfairy_index'] = null
        }

        i++
      }
    }

    itemsPropertiesLoaded[propertyIdRasterfairy] = true

    const cb = cbs[propertyIdRasterfairy]
    if (typeof cb === 'function') cb()

    itemsPropertiesOnLoading[propertyIdRasterfairy] = false
  }

  imageObj.src = 'data/rasterfairy.png'
}

/** 从 `data/heightmap.png` 与 `data/tsne.bin` 解析条目的 tsne 坐标。 */
export function getTsne(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdTsne]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdTsne] = callback

  if (itemsPropertiesOnLoading[propertyIdTsne]) return

  itemsPropertiesOnLoading[propertyIdTsne] = true

  // 加载 TSNE 高度图
  const heightmap = new Image()
  heightmap.onload = function () {
    // 保存高度图数据
    const canvas = document.createElement('canvas')
    canvas.width = heightmap.width
    canvas.height = heightmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(heightmap, 0, 0)
    const imgData = ctx.getImageData(0, 0, heightmap.width, heightmap.height)
    const data = imgData.data
    ImageTsneFormula.ctx = ctx
    ImageTsneFormula.heightMapData = data
    ImageTsneFormula.heightMapWidth = heightmap.width
    ImageTsneFormula.heightMapHeight = heightmap.height

    // 加载 TSNE 二进制数据
    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'data/tsne.bin', true)
    xhr.responseType = 'arraybuffer'
    xhr.onload = function () {
      const arrayBuffer = xhr.response as ArrayBuffer
      const dv = new DataView(arrayBuffer)
      const values: number[] = []
      let off = 0
      while (off < arrayBuffer.byteLength) {
        values.push(dv.getInt16(off, true))
        off += 2
      }

      // 写入 tsne 坐标
      const assets = legacyAtlas().assets
      for (let k = 0; k < assets.length; k++) {
        const i = k * 3
        const asset = assets[k]
        Model.items[asset.id]['tsne_x'] = values[i]
        Model.items[asset.id]['tsne_y'] = values[i + 1]
        Model.items[asset.id]['tsne_z'] = values[i + 2]
      }
      legacyAtlas().skipAnimation()

      // 回调处理

      itemsPropertiesLoaded[propertyIdTsne] = true

      const cb = cbs[propertyIdTsne]
      if (typeof cb === 'function') cb()

      itemsPropertiesOnLoading[propertyIdTsne] = false
    }
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
    xhr.send(null)
  }
  heightmap.src = 'data/heightmap.png'
}

/** 从 `data/timeline.png` 逐像素解析年份与 `date_created`（RGB = 年份 + 8300000）。 */
export function getDates(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdDates]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdDates] = callback

  if (itemsPropertiesOnLoading[propertyIdDates]) return

  itemsPropertiesOnLoading[propertyIdDates] = true

  const imageObj = new Image()

  imageObj.onload = function (this: HTMLImageElement) {
    const imageW = imageObj.width, imageH = imageObj.height
    const canvas = document.createElement('canvas')
    canvas.id = 'datescanvas'
    canvas.width = imageW
    canvas.height = imageH

    const context = canvas.getContext('2d')
    context.drawImage(this, 0, 0)
    const pixelData = context.getImageData(0, 0, imageW, imageH)

    // 注意：资源缺失时 `hex` 不会被重置，且下方 `else` 分支直接解引用 `asset.id`
    // （没有上面的 `if (asset)` 保护）。一旦图片像素数超过资源数量，`asset` 为
    // undefined 而 `hex` 仍是上一个像素的颜色，循环会抛 TypeError。因此
    // `data/timeline.png` 必须保证每个资源恰好一个像素。
    let hex = ''
    let parsingIndex = 0
    let i = 0
    let date: number | null = null
    let asset: Asset | null = null

    const assets = legacyAtlas().assets

    for (let y = 0; y < pixelData.height; y++) {
      for (let x = 0; x < pixelData.width; x++) {
        parsingIndex = (x + y * imageW) * 4

        asset = assets[i]
        if (asset)
          hex = '#' + ('000000' + rgbToHex(pixelData.data[parsingIndex], pixelData.data[parsingIndex + 1], pixelData.data[parsingIndex + 2])).slice(-6)

        i++
        if (hex === '#000000')
          date = null
        else {
          date = hexToNumber(hex) - 8300000

          Model.items[asset.id].date_created = new Date()
          Model.items[asset.id].date_created.setFullYear(date)
          Model.items[asset.id].year = date
        }
      }
    }

    itemsPropertiesLoaded[propertyIdDates] = true

    const cb = cbs[propertyIdDates]
    if (typeof cb === 'function') cb()

    itemsPropertiesOnLoading[propertyIdDates] = false
  }

  imageObj.src = 'data/timeline.png'
}

/** 从 `data/colors.png` 解析每个条目的色相与亮度。 */
export function getColors(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdColors]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdColors] = callback

  if (itemsPropertiesOnLoading[propertyIdColors]) return

  itemsPropertiesOnLoading[propertyIdColors] = true

  const imageObj = new Image()

  imageObj.onload = function (this: HTMLImageElement) {
    const imageW = imageObj.width, imageH = imageObj.height
    const canvas = document.createElement('canvas')
    canvas.id = 'colorscanvas'
    canvas.width = imageW
    canvas.height = imageH

    const context = canvas.getContext('2d')
    context.drawImage(this, 0, 0)
    const pixelData = context.getImageData(0, 0, imageW, imageH)

    // 这些局部变量未被使用（原实现即是如此）。
    let hex_1 = ''
    let hsl: number[] = []
    let color_hue = 0
    let color_bri = 0
    let parsingIndex = 0
    let i = 0
    let asset: Asset | null = null

    const assets = legacyAtlas().assets

    for (let y = 0; y < pixelData.height; y++) {
      for (let x = 0; x < pixelData.width; x++) {
        parsingIndex = (x + y * imageW) * 4

        asset = assets[i]
        if (asset) {
          // 全黑像素表示无信息
          if (pixelData.data[parsingIndex] === 0 &&
            pixelData.data[parsingIndex + 1] === 0 &&
            pixelData.data[parsingIndex + 2] === 0) {
            Model.items[asset.id].color_hue = null
            Model.items[asset.id].color_bri = null
          }
          else {
            Model.items[asset.id].color_hue = pixelData.data[parsingIndex] / 255 * 360
            Model.items[asset.id].color_bri = pixelData.data[parsingIndex + 1]
          }
        }

        i++
      }
    }

    itemsPropertiesLoaded[propertyIdColors] = true

    const cb = cbs[propertyIdColors]
    if (typeof cb === 'function') cb()

    itemsPropertiesOnLoading[propertyIdColors] = false
  }

  imageObj.src = 'data/colors.png'
}
