import { Object3D, Vector3 } from 'three'
import type { Asset } from '../../atlas/Asset'
import { dateLabels, type DateLabelFont } from '../../atlas/DateLabels'
import { Model } from '../../data/Models'
import { legacyScene } from '../../legacyScope'
import type { TimelineLabel } from './TimelineLabel'

/**
 * 时间线章节：按年代（十年）为资源分桶（`setup`），
 * 把每个年代排布成每行三个条目的列（`layout`），
 * 并用 `dateLabels` 绘制一行日期标签。
 * 构造函数创建承载标签的 `Object3D` 容器并加入场景。
 */

/** `setup()` 构建的单个年代桶。 */
interface YearData {
  year: number
  items: Asset[]
}

/**
 * `bboxes` 的一项，其 `x` / `y` 被时间线相机控制读取。
 * 使用类型别名（而非接口），以保持可赋值给带索引签名的 `DateLabelBlock`。
 */
export type TimescrollBBox = {
  year: string | number
  x: number
  y: number
  width: number
  height: number
}

/** `dateLabels.init` 返回的标签网格。 */
type TimelineLabelsMesh = ReturnType<typeof dateLabels.init>

export const Timescroll = class Timescroll {
  assets: Asset[]
  loadIterations = 0
  numYears = 0
  updatingAssets: Asset[] = []
  labels: TimelineLabel[] = []
  bboxes: TimescrollBBox[] = []

  initialized = false
  margin = new Vector3(25, 35, 25 * 3 + 30)

  /** 由 `setup()` 填充。 */
  years: string[] = []
  assetsPerYears: Record<string, YearData> = {}

  /** 仅由 `layout()` 中被注释掉的部分赋值，运行时为 undefined。 */
  timelineHeight: number

  container: Object3D

  constructor(assets: Asset[]) {
    this.assets = assets
    this.container = new Object3D()
    legacyScene().add(this.container)
  }

  /** 按十年为单位分桶资源，并把无日期的资源交给回调返回。 */
  setup(readyCb?: (itemsWithoutDate: string[]) => void): void {
    // 按年代为条目分桶
    const itemsWithoutDate: string[] = []
    this.assetsPerYears = {}
    let asset: Asset
    for (let i = 0, len = this.assets.length; i < len; i++) {
      asset = this.assets[i]

      let year = Model.items[asset.id].year
      if (year) {
        year = Math.floor(year / 10) * 10
        if (!this.assetsPerYears[year]) {
          this.assetsPerYears[year] = {
            year: year,
            items: [],
          }
        }
        this.assetsPerYears[year].items.push(asset)
      } else {
        itemsWithoutDate.push(asset.id)
      }
    }

    this.years = Object.keys(this.assetsPerYears)
    this.years.sort(function (a, b) {
      // 键为字符串，需显式转换为数字后比较
      return Number(a) - Number(b)
    })
    this.numYears = this.years.length
    if (readyCb) readyCb(itemsWithoutDate)
  }

  clear(): void {
    for (let k = 0, len = this.assets.length; k < len; k++) {
      this.assets[k].tween = 1
    }
    while (this.container.children.length) {
      this.container.remove(this.container.children[0])
    }
  }

  remove(): void {
    this.clear()
    this.labels = []
    legacyScene().remove(this.container)
    // 容器置空：仅在新建实例后才会重新使用
    this.container = null as unknown as Object3D
  }

  reset(): void {
    this.clear()
  }

  getWidth(): number {
    return this.years.length * this.margin.z
  }

  update(): void {
    for (let i = 0; i < this.labels.length; i++) this.labels[i].updateQuaternion()

    let asset: Asset
    let d: number
    for (let i = 0, l = this.updatingAssets.length; i < l; i++) {
      asset = this.updatingAssets[i]
      d = 1 - asset.tween
      if (d > 0.02) {
        asset.tween += d * 0.08
      } else {
        asset.tween = 1
      }
    }
  }

  /** 布局每个年代：每行三个条目，并生成日期标签。 */
  layout(): void {
    const size = 20 // 条目尺寸
    const space = 10 // 条目间距
    const block = size + space // 条目 + 间距
    const margin = 40 // 每三个条目组成一块，此为块间距

    // 三个条目组成的块总宽度（含块间距）
    const blockWidth = 3 * size + 2 * space + margin

    this.margin.z = blockWidth
    for (let i = 0; i < this.years.length; i++) {
      const yearData = this.assetsPerYears[this.years[i]]

      const heightcount = Math.ceil(yearData.items.length / 3)

      const prettyFormat =
        parseFloat(String(yearData.year)) < 0
          ? yearData.year.toString().replace('-', '') + ' BC'
          : yearData.year

      const box: TimescrollBBox = {
        year: prettyFormat,
        x: i * blockWidth,
        y: 0,
        width: 3 * size + 2 * space,
        height: heightcount * block,
      }

      yearData.items.forEach(function (asset, i, arr) {
        const x = box.x + ((i + (arr.length > 2 ? 1 : 0)) % 3) * block
        const y = block + parseInt(String(i / 3)) * block
        const z = 0
        asset.setPosition(x, y, z)
      })

      this.bboxes.push(box)
    }

    if (this.initialized) return
    this.initialized = true
    // 创建标签
    this.createLabels(this.bboxes, blockWidth, { color: '#FFF', size: 64, padding: 1, type: 'roboto' })
  }

  /** 为时间线创建日期标签。 */
  createLabels(dates: TimescrollBBox[], spacing: number, font?: DateLabelFont): TimelineLabelsMesh {
    const mesh = dateLabels.init(dates, spacing, font)
    this.container.add(mesh)

    return mesh
  }

  getBoundingBoxByYear(year: string | number): TimescrollBBox {
    let selected: TimescrollBBox | undefined = undefined
    this.bboxes.forEach(function (b) {
      // 保持宽松比较：多数条目 `year` 为数字，负数条目格式化为 '... BC' 字符串
      if (b.year == year) {
        selected = b
      }
    })
    return selected || this.bboxes[this.bboxes.length - 1]
  }

  burstYear(yearId: number): number {
    return this.getWidth()
  }
}
