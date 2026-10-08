import {
  Mesh,
  Object3D,
  PlaneGeometry,
  Texture,
  Vector2,
  type Quaternion,
  type ShaderMaterial,
  type Vector3,
} from 'three'
import { gsap } from 'gsap'
import { cameraControls } from '../camera/CameraControls'
import { getItem } from '../data/Models'
import { app, shared } from '../Main'
import { atlasInstance, legacyCamera, legacyParams, modelItems } from '../legacyScope'
import { MetaDataMaterial } from './MetadataMaterial'
import { lod } from './lod/lod'

/**
 * 元数据标签模块：为附近可见的资产各生成一个 `MetadataLabel`，
 * 并将标题 / 作者等信息绘制到 canvas 纹理上（由 `MetaDataMaterial` 使用）。
 */

/* ------------------------------------------------------------------------- *
 * 绘制到标签 canvas 上的链接图标
 * ------------------------------------------------------------------------- */

export const imageLabelLinkObj = new Image()
export const imageLabelAndroidLinkObj = new Image()

/**
 * 链接图标的加载状态。`onload` 回调会修改它们，
 * 因此用可变对象持有，读取时通过 `.value` 获取。
 */
export const labelLinkImageLoaded = { value: false }
export const labelLinkAndroidImageLoaded = { value: false }

imageLabelLinkObj.onload = function () {
  labelLinkImageLoaded.value = true
}
imageLabelAndroidLinkObj.onload = function () {
  labelLinkAndroidImageLoaded.value = true
}
imageLabelLinkObj.src = 'imgs/ic_open_in_new.png'
imageLabelAndroidLinkObj.src = 'imgs/ic_smartphone.png'

/** LOD 迭代计数。 */
export let lodIteration = 0

/** 本模块所需的图集资产字段。 */
export interface MetadataAsset {
  id: string
  coords: { x: number; y: number; w: number; h: number }
  position: Vector3
}

/** 本模块所需的 `Model.items[id]` 字段。 */
export interface MetadataItem {
  id: string
  title?: string
  creator?: string
  creator_name?: string
  partner?: string
  partner_url?: string
  date_created?: Date | number | null
  updated?: boolean
  [key: string]: unknown
}

/** 标签 canvas 上一个可点击的矩形区域。 */
interface LabelRect {
  x: number
  y: number
  w: number
  h: number
}

/** `MetadataLabel.click()` 的返回值；`atlas.hitLabel` 依据 `type` 分支处理。 */
export interface MetadataHit {
  asset: MetadataAsset
  url?: string
  type?: 'external' | 'app'
  title?: string | null
}

/** `lod` 的 `update` 事件负载（`{ assets }`）。 */
export interface LODUpdateEvent {
  assets: Record<string, string[]>
}

type LodInstance = typeof lod

/** 收集并更新各资产的元数据标签。 */
export class LODMetadatas {
  lod: LodInstance
  labels: MetadataLabel[]
  /**
   * 注意：尽管名字带 `Lod`，实际是数组。
   * 它保存所有可见资产的 id，而非按 LOD 分组的字典。
   */
  labelIdsLod: string[]
  container: Object3D
  asset: MetadataAsset | null
  lodUpdateHandler: (event: LODUpdateEvent) => void

  constructor(lodInstance: LodInstance) {
    this.lod = lodInstance
    this.labels = []
    this.labelIdsLod = []
    this.container = new Object3D()
    this.asset = null
    this.lodUpdateHandler = this.onLODUpdate.bind(this)
    this.lod.events.addListener('update', this.lodUpdateHandler)
  }

  update(): void {
    let l = this.labels.length

    for (let i = 0; i < l; i++) {
      this.labels[i].updatePosition()

      // 自由落体片头时隐藏标签
      if (hideMetadata()) {
        this.labels[i].material.uniforms.alpha.value = 0
      }
    }

    if (l > 0) {
      while (l--) {
        if (this.labels[l].isOut) {
          this.labels[l].dispose()
          this.container.remove(this.labels[l])
          this.labels.splice(l, 1)
        }
      }
    }

    // 检测标签是否正在淡入淡出，必要时强制渲染
    let render: boolean = getRenderNeeded()
    let alpha: number = NaN

    if (this.labels.length > 0) {
      for (let i = 0; i < this.labels.length; i++) {
        alpha = this.labels[i].material.uniforms.alpha.value

        if (alpha > 0.001 && alpha < 0.999) {
          render = true
        }
      }
    }
    setRenderNeeded(render)
  }

  /*
   * LOD 更新回调：添加新标签并移除不再使用的标签
   */
  onLODUpdate(event: LODUpdateEvent): void {
    // 使用最近一级的资产范围来显示标签
    // 注意：这里读取的是模块单例 `lod`，`this.lod` 仅用于事件的订阅 / 取消订阅
    let lodLimit = lod.minimumLODResolution

    if (legacyParams().isBigWallVersion) {
      lodLimit = 1024
    }

    this.labelIdsLod = []

    for (let i = 0; i < this.labels.length; i++) {
      this.labels[i].fadeOut()
    }

    for (const assets in event.assets) {
      // 键是字符串形式的 LOD 尺寸，这里显式转为数字再比较（非数字键结果为 false）
      if (Number(assets) >= lodLimit) {
        for (const assetId of event.assets[assets]) {
          this.labelIdsLod.push(assetId)
          this.addAssetLabel(assetId)
        }
      }
    }
  }

  addLabel(assetId: string): void {
    const atlas = legacyAtlas()
    const asset = atlas.getAsset(assetId)

    if (asset == null) return

    // 已存在同名标签则高亮它，否则新建
    let i = 0
    for (i = 0; i < this.labels.length; i++) {
      if (this.labels[i].name == assetId) {
        this.labels[i].fadeIn()
        return
      }
    }
    if (this.labelIdsLod.indexOf(assetId) == -1) return

    const asset32pxFactor = 1
    const assetSize = new Vector2(asset.coords.w * asset32pxFactor, asset.coords.h * asset32pxFactor)

    // 创建标签
    const label = new MetadataLabel(
      modelItems()[assetId] as unknown as MetadataItem,
      assetSize,
      asset.position,
      asset,
    )
    this.container.add(label)
    this.labels.push(label)
  }

  onMetadata(metadata: MetadataItem): void {
    this.addLabel(metadata.id)
  }

  addAssetLabel(assetId: string): void {
    const item = modelItems()[assetId] as unknown as MetadataItem | undefined

    if (item && item.updated == true) {
      this.addLabel(assetId)
    } else {
      legacyGetItem()(assetId, this.onMetadata.bind(this))
    }
  }

  clear(): void {
    this.labels = []
    this.labelIdsLod = []

    while (this.container.children.length) {
      ;(this.container.children[0] as MetadataLabel).dispose()
      this.container.remove(this.container.children[0])
    }
  }

  removeAll(): void {
    this.labelIdsLod = []

    for (let i = 0; i < this.labels.length; i++) this.labels[i].fadeOut()
  }

  remove(): void {
    this.lod.events.removeListener('update', this.lodUpdateHandler)
    this.clear()
  }
}

/** 将相机跳转到指定资产。 */
export function gotoAsset(id: string): void {
  currentCameraControls().gotoAsset(legacyAtlas().getAssetsFromIds([id])[0])
}
/**
 * 单个元数据标签：绘制标题 / 作者等信息，
 * 并处理点击命中与淡入淡出。
 */
export class MetadataLabel extends Mesh {
  /**
   * 标签固定使用 `MetaDataMaterial` 构建的 shader 材质。
   * 必须用 `declare`：若声明为真实字段，会在 `super()` 之后赋值，
   * 覆盖 three 的 `Mesh` 构造函数刚存入的材质。
   */
  declare material: ShaderMaterial

  asset: MetadataAsset
  canvasSizeDiviser: number
  size: number
  data: MetadataItem
  canvasH: number
  assetSize: Vector2
  assetPosition: Vector3
  positionOffset: number
  canvas: HTMLCanvasElement
  canvasW: number
  canvasPixRatio: number
  canvasBaseY: number
  bottomY: number
  partnerRect?: LabelRect
  titleRectAuthor: LabelRect | null
  titleRectLineOne: LabelRect | null
  titleRectLineTwo: LabelRect | null
  linkX: number
  linkY: number
  linkRadius: number
  linkAndroidX: number
  isOut: boolean

  constructor(data: MetadataItem, assetSize: Vector2, assetPosition: Vector3, asset: MetadataAsset) {
    let size = 512
    const canvasSizeQuality = 2 // 2 表示 1024
    size = size * canvasSizeQuality
    let canvasHDiviser = 1

    // 画布 ---------------------------------------------------
    // ********* 绘制元数据面板 ******************
    // 使用一块较大的临时 canvas（只创建一次并复用）
    let tempCnvs = getTempCanvas()
    if (!tempCnvs) {
      tempCnvs = document.createElement('canvas')
      tempCnvs.width = size
      tempCnvs.height = size
      setTempCanvas(tempCnvs)
    }

    let date: number | Date | undefined
    const created = data.date_created
    if (created && (created as Date).getFullYear)
      date = (created as Date).getFullYear()
    else if (created)
      date = created as number

    // 参数
    const padding = 10 * canvasSizeQuality
    const linkRadius = 16 * canvasSizeQuality
    let linkX = 0
    let linkY = 0
    let linkAndroidX = 0

    let ctx = tempCnvs.getContext('2d')
    const canvasBaseY = 0

    // 填充 canvas
    ctx.beginPath()
    ctx.fillStyle = 'white'
    ctx.rect(0, canvasBaseY, tempCnvs.width, tempCnvs.height)
    ctx.fill()

    ctx.beginPath()

    // 绘制文字
    ctx.fillStyle = 'black'

    const x = 10 * canvasSizeQuality + padding
    let y = canvasBaseY
    const topbottomPadding = 4 * canvasSizeQuality
    let titleRectLineOne: LabelRect | null = null
    let titleRectLineTwo: LabelRect | null = null
    let titleRectAuthor: LabelRect | null = null
    let partnerRect: LabelRect | null = null

    y = topbottomPadding

    if (data.title) {
      const fontSize = 22 * canvasSizeQuality
      ctx.font = fontSize + 'px Roboto'

      let maxTextW = tempCnvs.width - x - 10 * canvasSizeQuality - padding * 2
      if (!data.partner) maxTextW -= linkRadius * 2 + padding * 2

      if (ctx.measureText(data.title).width > maxTextW) {
        const arrWords = data.title.split(' ')
        let line = ''
        let numLines = 0

        // 第一行：按单词逐个填充
        for (let i = 0; i < arrWords.length; i++) {
          if (ctx.measureText(line + arrWords[i] + ' ').width > maxTextW) {
            y += fontSize + padding
            ctx.fillText(line, x, y)

            titleRectLineOne = {
              x: x,
              y: y - 15 * canvasSizeQuality,
              w: ctx.measureText(line).width,
              h: 28 * canvasSizeQuality,
            }

            numLines++
            break
          } else {
            line += arrWords[i] + ' '
          }
        }

        if (numLines == 0) {
          y += fontSize + padding
          ctx.fillText(line, x, y)

          titleRectLineOne = {
            x: x,
            y: y - 15 * canvasSizeQuality,
            w: ctx.measureText(line).width,
            h: 28 * canvasSizeQuality,
          }
        } else {
          // 第二行：超出部分以省略号结尾
          let txtSecondLine = data.title.replace(line, '')
          if (ctx.measureText(txtSecondLine).width > maxTextW) {
            while (ctx.measureText(txtSecondLine + '...').width > maxTextW) {
              txtSecondLine = txtSecondLine.substring(0, txtSecondLine.length - 1)
            }
            txtSecondLine += '...'
          }
          y += fontSize + padding
          ctx.fillText(txtSecondLine, x, y)

          titleRectLineTwo = {
            x: x,
            y: y - 15 * canvasSizeQuality,
            w: ctx.measureText(txtSecondLine).width,
            h: 28 * canvasSizeQuality,
          }
        }
      } else {
        y += fontSize + padding
        ctx.fillText(data.title, x, y)

        titleRectLineOne = {
          x: x,
          y: y - 15 * canvasSizeQuality,
          w: ctx.measureText(data.title).width,
          h: 28 * canvasSizeQuality,
        }
      }
    }

    ctx.beginPath()
    ctx.fillStyle = 'black'
    const fontSize = 15 * canvasSizeQuality
    ctx.font = fontSize + 'px Roboto'
    let text = ''
    let pre_author = ''
    if (date && !isNaN(date as unknown as number)) {
      // date 可能是年份数字或 Date：负数按公元前（BC）显示
      text += (date as unknown as number) < 0 ? -(date as unknown as number) + ' BC' : String(date)
      pre_author = ', '
    }
    if (data.creator) {
      text += pre_author + data.creator
    } else if (data.creator_name && data.creator_name !== '') {
      text += pre_author + data.creator_name
    }
    if (text != '') {
      y += fontSize + padding
      ctx.fillText(text, x, y)
      titleRectAuthor = {
        x: x,
        y: y - 9 * canvasSizeQuality,
        w: ctx.measureText(text).width,
        h: 15 * canvasSizeQuality,
      }
    }

    linkX = tempCnvs.width - linkRadius * 2 - padding - 5 * canvasSizeQuality

    if (data.partner) {
      const maxPartnerTextW = !legacyParams().isBigWallVersion
        ? linkX - x - linkRadius * 4 - padding * 2 - 10 * canvasSizeQuality
        : tempCnvs.width - x - padding - 5 * canvasSizeQuality
      y += fontSize + padding
      // 该值可能是 css 颜色字符串或 THREE.Color（canvas 会自动转成字符串）
      ctx.fillStyle = appCurrentColor() as string
      let partnerLabel = data.partner
      if (ctx.measureText(partnerLabel).width > maxPartnerTextW) {
        while (ctx.measureText(partnerLabel + '...').width > maxPartnerTextW) {
          partnerLabel = partnerLabel.substring(0, partnerLabel.length - 1)
        }
        partnerLabel += '...'
      }
      ctx.fillText(partnerLabel, x, y)
      // 记录矩形区域用于点击检测
      partnerRect = {
        x: x,
        y: y - 4 * canvasSizeQuality,
        w: ctx.measureText(partnerLabel).width,
        h: 15 * canvasSizeQuality,
      }

      // 下划线
      ctx.rect(partnerRect.x, partnerRect.y + 6 * canvasSizeQuality, Math.min(partnerRect.w, maxPartnerTextW), 1)
      // 放大点击区域
      partnerRect.x -= 1 * canvasSizeQuality
      partnerRect.y -= 4 * canvasSizeQuality
      partnerRect.w += 6 * canvasSizeQuality
      partnerRect.h += 6 * canvasSizeQuality

      ctx.fill()
    }

    y += 15 * canvasSizeQuality + padding + topbottomPadding
    y = Math.max(y, linkY + linkRadius * 2 + padding)

    linkY = y - 5 - padding - linkRadius * 2
    linkAndroidX = linkX - linkRadius * 2 - padding

    if (!legacyParams().isBigWallVersion) {
      ctx.fillStyle = '#dcdcdc'
      ctx.beginPath()
      ctx.arc(linkX + linkRadius, linkY + linkRadius, linkRadius, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#dcdcdc'
      ctx.beginPath()
      ctx.arc(linkAndroidX + linkRadius, linkY + linkRadius, linkRadius, 0, Math.PI * 2)
      ctx.fill()

      if (labelLinkImageLoaded.value)
        ctx.drawImage(imageLabelLinkObj, linkX + 8 * canvasSizeQuality, linkY + 8 * canvasSizeQuality)

      if (labelLinkAndroidImageLoaded.value)
        ctx.drawImage(imageLabelAndroidLinkObj, linkAndroidX + 11 * canvasSizeQuality, linkY + 7 * canvasSizeQuality)
    }

    const bottomY = y

    // 计算 canvasHDiviser，取最接近的 2 的幂
    canvasHDiviser = Math.pow(2, Math.round(Math.log(tempCnvs.width / bottomY) / Math.log(2)))

    const cnvs = document.createElement('canvas')
    cnvs.width = size
    cnvs.height = size / canvasHDiviser
    ctx = cnvs.getContext('2d')

    ctx.drawImage(tempCnvs, 0, 0, tempCnvs.width, bottomY, 0, 0, cnvs.width, cnvs.height)

    // 绘制结束 ---------------------------------------------------

    const texture = new Texture(cnvs)
    texture.needsUpdate = true
    const material = MetaDataMaterial.getMaterial(texture)
    super(new PlaneGeometry(assetSize.x, assetSize.x / canvasHDiviser), material)
    this.asset = asset
    this.name = data.id
    this.canvasSizeDiviser = canvasHDiviser
    this.size = size
    this.data = data

    this.scale.y = bottomY / cnvs.height

    this.canvasH = assetSize.x / canvasHDiviser
    this.assetSize = assetSize
    this.assetPosition = assetPosition
    // 曾尝试再加 1 像素偏移，但在球面上会导致图像重叠，故不加
    this.positionOffset = -this.canvasH * 0.5 * this.scale.y - this.assetSize.y * 0.5

    this.canvas = cnvs
    this.canvasW = this.assetSize.x
    this.canvasPixRatio = this.size / this.assetSize.x
    this.canvasBaseY = canvasBaseY
    this.bottomY = bottomY
    if (partnerRect) this.partnerRect = partnerRect

    this.titleRectAuthor = titleRectAuthor
    this.titleRectLineOne = titleRectLineOne
    this.titleRectLineTwo = titleRectLineTwo

    this.linkX = linkX
    this.linkY = linkY
    this.linkRadius = linkRadius
    this.linkAndroidX = linkAndroidX

    this.isOut = false
    this.material.uniforms.alpha.value = 0
    this.fadeIn()
  }

  onFadeOutComplete(): void {
    this.isOut = true
  }

  fadeIn(): void {
    this.isOut = false
    // 先取消同一属性上的其它补间，避免残留的淡出把标签重新拉暗
    gsap.killTweensOf(this.material.uniforms.alpha)
    gsap.to(this.material.uniforms.alpha, {
      duration: 0.6,
      value: 1,
    })
  }

  fadeOut(): void {
    // 保留的历史问题：这里立即设置 `isOut`（而非在 `onFadeOutComplete` 中设置），
    // 导致 `LODMetadatas.update()` 在下一帧就销毁该标签，0.6 秒的淡出补间不会播放。
    this.isOut = true
    // 先取消残留补间，避免与淡入冲突
    gsap.killTweensOf(this.material.uniforms.alpha)
    gsap.to(this.material.uniforms.alpha, {
      duration: 0.6,
      value: 0,
      onComplete: () => this.onFadeOutComplete(),
    })
  }

  testClickRect(clickX: number, clickY: number, rect: LabelRect | null | undefined): boolean {
    if (
      rect &&
      clickX >= rect.x &&
      clickX <= rect.x + rect.w &&
      clickY + 10 >= rect.y &&
      clickY + 10 <= rect.y + rect.h
    )
      return true
    else return false
  }

  /** 命中检测：把世界坐标换算到标签局部坐标后判断命中的区域。 */
  click(point: Vector3): MetadataHit {
    const local = this.worldToLocal(point.clone())

    const clickX = (local.x / this.canvasW + 0.5) * this.canvas.width
    let clickY = -((local.y / this.canvasH + 0.5) * this.canvas.height - this.canvas.height)

    clickY = clickY * this.scale.y

    const url =
      'https://www.google.com/culturalinstitute/asset-viewer/' +
      this.name +
      '?utm_campaign=cilex_v1&utm_source=cilab&utm_medium=artsexperiments&utm_content=' +
      legacyParams().directChapter

    let test = this.testClickRect(clickX, clickY, this.titleRectLineOne)
    if (test) return { url: url, type: 'external', asset: this.asset }

    test = this.testClickRect(clickX, clickY, this.titleRectLineTwo)
    if (test) return { url: url, type: 'external', asset: this.asset }

    test = this.testClickRect(clickX, clickY, this.titleRectAuthor)
    if (test) return { url: url, type: 'external', asset: this.asset }

    test = this.testClickRect(clickX, clickY, this.partnerRect)
    if (test) {
      const needle = this.data.partner_url.toLowerCase()
      return {
        type: 'external',
        url:
          'https://www.google.com/culturalinstitute/beta/partner/' +
          needle +
          '?utm_campaign=cilex_v1&utm_source=cilab&utm_medium=artsexperiments&utm_content=' +
          legacyParams().directChapter,
        asset: this.asset,
      }
    }

    const pLinkX = this.linkX + this.linkRadius
    const pLinkY = this.linkY + this.linkRadius

    const distanceLinkSquared = (clickX - pLinkX) * (clickX - pLinkX) + (clickY - pLinkY) * (clickY - pLinkY)
    if (distanceLinkSquared <= this.linkRadius * this.linkRadius) {
      return {
        url: url,
        type: 'external',
        asset: this.asset,
      }
    }

    const cLinkAndroidX = this.linkAndroidX + this.linkRadius
    const distanceAndroidSquared =
      (clickX - cLinkAndroidX) * (clickX - cLinkAndroidX) + (clickY - pLinkY) * (clickY - pLinkY)
    if (distanceAndroidSquared <= this.linkRadius * this.linkRadius) {
      return {
        url: this.data.id,
        type: 'app',
        asset: this.asset,
      }
    }
    return { asset: this.asset }
  }

  dispose(): void {
    gsap.killTweensOf(this.material.uniforms.alpha)

    const mat = this.material

    mat.uniforms.map.value.dispose()
    mat.dispose()
  }

  /** 更新标签位置与朝向，使其始终正对相机。 */
  updatePosition(): void {
    this.position.copy(this.assetPosition.clone())
    this.translateY(this.positionOffset)
    this.quaternion.copy(metadataCamera().quaternion)
  }
}

/* ------------------------------------------------------------------------- *
 * 延迟读取的共享状态访问器：这些值在本模块被求值时还不存在，
 * 因此只在调用时通过下面的函数读取。
 * ------------------------------------------------------------------------- */

/** `renderNeeded`：为 true 时需要渲染一帧。 */
function getRenderNeeded(): boolean {
  return shared.renderNeeded
}

function setRenderNeeded(value: boolean): void {
  shared.renderNeeded = value
}

/** 是否隐藏元数据标签（自由落体片头时为 true）。 */
function hideMetadata(): boolean {
  return shared.hideMetadata
}

/** 首个标签创建的临时画布，供后续标签复用。 */
let tempCanvas: HTMLCanvasElement

function getTempCanvas(): HTMLCanvasElement {
  return tempCanvas
}

function setTempCanvas(canvas: HTMLCanvasElement): void {
  tempCanvas = canvas
}

/** 模型层的 `getItem`。 */
function legacyGetItem(): (id: string, callback: (item: unknown) => void) => void {
  return getItem as unknown as (id: string, callback: (item: unknown) => void) => void
}

/** 相机控制器；此处调用其 `gotoAsset`。 */
function currentCameraControls(): { gotoAsset(asset: unknown): void } {
  return cameraControls as unknown as { gotoAsset(asset: unknown): void }
}

/** `app.currentColor`（css 颜色字符串或 THREE.Color）。 */
function appCurrentColor(): unknown {
  return (app as unknown as { currentColor: unknown }).currentColor
}

/** 本模块用到的图集接口。 */
interface MetadataAtlas {
  getAsset(id: string): MetadataAsset | null
  getAssetsFromIds(ids: string[]): MetadataAsset[]
}

function legacyAtlas(): MetadataAtlas {
  return atlasInstance() as unknown as MetadataAtlas
}

/** 相机；此处只读取其 `quaternion`。 */
function metadataCamera(): { quaternion: Quaternion } {
  return legacyCamera() as unknown as { quaternion: Quaternion }
}
