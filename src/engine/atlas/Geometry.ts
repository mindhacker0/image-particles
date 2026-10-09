import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type BufferAttribute,
} from 'three'
import { markRenderNeeded } from '../legacyScope'
import type { Asset } from './Asset'
import type { Texture } from './Texture'

/**
 * 图集网格共用的实例化几何体：每个资源一个四边形，
 * 每个可动画属性对应一个实例化 attribute。
 */

export const planeGeom = new PlaneGeometry(1, 1)

interface GeometryAttributeDescription {
  name: string
  size: number
  isStatic?: boolean
}

interface AssetLookup {
  [id: string]: {
    position: { x: number; y: number; z: number }
    color: { r: number; g: number; b: number }
    tween?: number
  }
}

/** 管理实例化几何体的 attribute，并驱动位置 / 颜色 / 补间的更新。 */
export class Geometry {
  texture: Texture
  lod: number
  geometry: InstancedBufferGeometry
  updateFlags: { position: boolean; color: boolean; tween: boolean }
  attributes: Record<string, InstancedBufferAttribute> = {}
  bufferPositionsPerAssetIds: Record<string, number> = {}
  currPosition = 0
  currGeomPos = 0
  cachedIds: string[] | null = null

  constructor(texture: Texture) {
    this.texture = texture
    this.lod = this.texture.lod

    // 创建实例化缓冲几何体
    this.geometry = new InstancedBufferGeometry()
    // `copy` 只复制普通平面几何体的 attribute 与索引
    this.geometry.copy(planeGeom as unknown as InstancedBufferGeometry)
    this.geometry.instanceCount = this.texture.getNumItemsMax()

    // 用标志位记录各资源需要更新的属性
    this.updateFlags = {
      position: false,
      color: false,
      tween: false,
    }

    this.setup()
  }

  setup(): void {
    this.currGeomPos = 0

    const geom = this.geometry
    const tex = this.texture

    // 归一化 three.js 内部的 uv attribute 缓冲
    const uvAttr = geom.getAttribute('uv') as BufferAttribute
    uvAttr.needsUpdate = true

    const norm = tex.assetSize as number / 16
    for (let i = 0; i < uvAttr.array.length; i++) {
      uvAttr.array[i] /= tex.width
      // 以 assetSize 为单位归一化（LOD 需要）
      uvAttr.array[i] *= norm
    }

    // 定义着色器 attribute 布局
    const attributes: GeometryAttributeDescription[] = [
      { name: 'tween', size: 1 },
      { name: 'uvOffset', size: 2 },
      { name: 'translate', size: 3 },
      { name: 'translateDest', size: 3 },
      { name: 'scale', size: 3 },
      { name: 'color', size: 3 },
      { name: 'colorDest', size: 3 },
      { name: 'uidColor', size: 3, isStatic: true },
    ]

    for (const attr of attributes) {
      // 分配缓冲（每个实例一个属性值）
      const buffer = new Float32Array(geom.instanceCount * attr.size)
      const buffAttr = new InstancedBufferAttribute(buffer, attr.size)

      if (!attr.isStatic) {
        buffAttr.setUsage(DynamicDrawUsage)
      }

      geom.setAttribute(attr.name, buffAttr)
      this.attributes[attr.name] = buffAttr
    }
  }

  append(asset: Asset, coords: { x: number; y: number; w: number; h: number }): number {
    const x = coords.x
    const y = coords.y
    const w = coords.w
    const h = coords.h

    // 若该资源已有可用槽位（例如移除后又重新加入），则复用
    const positionInBuffer = this.bufferPositionsPerAssetIds[asset.id] !== undefined
      ? this.bufferPositionsPerAssetIds[asset.id]
      : this.getNextPosition(asset.id)

    // 记录该资源在 attribute 缓冲中的位置
    asset.positionInbuffer = positionInBuffer

    const i1 = positionInBuffer
    const i2 = positionInBuffer * 2
    const i3 = positionInBuffer * 3

    // 补间进度
    this.attributes['tween'].array[i1] = 1

    // uv 偏移
    const uvOffsets = this.attributes['uvOffset'].array
    const textureSize = this.texture.width
    uvOffsets[i2 + 0] = x / textureSize
    uvOffsets[i2 + 1] = (textureSize - y - h) / textureSize

    // 尺寸
    const scale = this.attributes['scale'].array
    const assetSize = this.texture.assetSize as number
    scale[i3 + 0] = Math.floor((w / assetSize) * 16)
    scale[i3 + 1] = Math.floor((h / assetSize) * 16)
    scale[i3 + 2] = 1

    // 位置
    const p = asset.position
    for (const name of ['translate', 'translateDest']) {
      const buff = this.attributes[name].array
      buff[i3 + 0] = p.x
      buff[i3 + 1] = p.y
      buff[i3 + 2] = p.z
    }

    // 颜色
    const c = asset.color
    for (const name of ['color', 'colorDest']) {
      const buff = this.attributes[name].array
      buff[i3 + 0] = c.r
      buff[i3 + 1] = c.g
      buff[i3 + 2] = c.b
    }

    // 用于拾取颜色的 UID
    const uidBuff = this.attributes['uidColor'].array
    uidBuff[i3 + 0] = ((asset.uid >> 16) & 0xff) / 0xff
    uidBuff[i3 + 1] = ((asset.uid >> 8) & 0xff) / 0xff
    uidBuff[i3 + 2] = (asset.uid & 0xff) / 0xff

    // 标记所有 attribute 需要更新
    for (const attr in this.attributes) {
      this.attributes[attr].needsUpdate = true
    }

    // 让该资源上报同样的更新标志
    asset.updateFlags = this.updateFlags

    // 使缓存的 id 数组失效
    this.cachedIds = null

    // 记录该资源的缓冲位置
    this.bufferPositionsPerAssetIds[asset.id] = positionInBuffer
    return positionInBuffer
  }

  /** 返回下一个可用的缓冲槽位（环形复用）。 */
  getNextPosition(_id: string): number {
    const pos = this.currPosition % this.geometry.instanceCount
    this.currPosition++
    return pos
  }

  // 几何体无法真正删除，因此把实例的 scale 设为 0 来隐藏
  remove(asset: Asset): void {
    this.hide(asset)
  }

  hide(asset: Asset): void {
    if (asset.positionInbuffer === -1) {
      console.warn("this asset doesn't belong to any geometry")
      return
    }

    const i = asset.positionInbuffer * 3
    const scaleBuffer = this.attributes['scale']
    scaleBuffer.array[i] = scaleBuffer.array[i + 1] = 0
    scaleBuffer.array[i + 2] = 1
    scaleBuffer.needsUpdate = true

    asset.updateFlags = {}
    markRenderNeeded()
  }

  show(asset: Asset): void {
    if (asset.positionInbuffer === -1) {
      console.warn("this asset doesn't belong to any geometry")
      return
    }

    const i = asset.positionInbuffer * 3
    const scaleBuffer = this.attributes['scale']
    const assetSize = this.texture.assetSize as number

    scaleBuffer.array[i] = Math.floor((asset.coords.w / assetSize) * 16)
    scaleBuffer.array[i + 1] = Math.floor((asset.coords.h / assetSize) * 16)
    scaleBuffer.array[i + 2] = 1
    scaleBuffer.needsUpdate = true

    asset.updateFlags = {}
    markRenderNeeded()
  }

  // 资源在该几何体中不再可用时调用（仅出现在 LOD 等动态纹理中）
  discard(asset: Asset): void {
    delete this.bufferPositionsPerAssetIds[asset.id]
  }

  applyAttributes(pct: number): void {
    const colorAttr = this.attributes['color']
    colorAttr.needsUpdate = true
    const colorArr = colorAttr.array
    const colorDestArr = this.attributes['colorDest'].array

    const transAttr = this.attributes['translate']
    transAttr.needsUpdate = true
    const transArr = transAttr.array
    const transDestArr = this.attributes['translateDest'].array

    if (!this.cachedIds) {
      this.cachedIds = this.getAssetIds()
    }

    for (let j = 0, l = this.cachedIds.length; j < l; j++) {
      const assetId = this.cachedIds[j]
      const i = this.bufferPositionsPerAssetIds[assetId]
      const i3 = i * 3

      // 位置
      transArr[i3 + 0] = transDestArr[i3 + 0] * pct + transArr[i3 + 0] * (1 - pct)
      transArr[i3 + 1] = transDestArr[i3 + 1] * pct + transArr[i3 + 1] * (1 - pct)
      transArr[i3 + 2] = transDestArr[i3 + 2] * pct + transArr[i3 + 2] * (1 - pct)

      // 颜色
      colorArr[i3 + 0] = colorDestArr[i3 + 0] * pct + colorArr[i3 + 0] * (1 - pct)
      colorArr[i3 + 1] = colorDestArr[i3 + 1] * pct + colorArr[i3 + 1] * (1 - pct)
      colorArr[i3 + 2] = colorDestArr[i3 + 2] * pct + colorArr[i3 + 2] * (1 - pct)
    }

    markRenderNeeded()
  }

  getAssetIds(): string[] {
    return Object.keys(this.bufferPositionsPerAssetIds)
  }

  updatePositionAttributes(assets: AssetLookup): void {
    if (!this.cachedIds) {
      this.cachedIds = this.getAssetIds()
    }

    const attr = this.attributes['translateDest']
    attr.needsUpdate = true

    for (let j = 0, l = this.cachedIds.length; j < l; j++) {
      const assetId = this.cachedIds[j]
      const i3 = this.bufferPositionsPerAssetIds[assetId] * 3

      if (!assets[assetId]) {
        console.log('asset not found', assetId)
      } else {
        attr.array[i3 + 0] = assets[assetId].position.x
        attr.array[i3 + 1] = assets[assetId].position.y
        attr.array[i3 + 2] = assets[assetId].position.z
      }
    }

    this.updateFlags.position = false
    markRenderNeeded()
  }

  updateColorAttributes(assets: AssetLookup): void {
    if (!this.cachedIds) {
      this.cachedIds = this.getAssetIds()
    }

    const attr = this.attributes['colorDest']
    attr.needsUpdate = true

    for (let j = 0, l = this.cachedIds.length; j < l; j++) {
      const assetId = this.cachedIds[j]
      const i3 = this.bufferPositionsPerAssetIds[assetId] * 3

      if (!assets[assetId]) {
        console.log('color asset not found', assetId)
      } else {
        attr.array[i3 + 0] = assets[assetId].color.r
        attr.array[i3 + 1] = assets[assetId].color.g
        attr.array[i3 + 2] = assets[assetId].color.b
      }
    }

    this.updateFlags.color = false
    markRenderNeeded()
  }

  updateTweenAttributes(assets: AssetLookup): void {
    if (!this.cachedIds) {
      this.cachedIds = this.getAssetIds()
    }

    const attr = this.attributes['tween']
    attr.needsUpdate = true

    for (let j = 0, l = this.cachedIds.length; j < l; j++) {
      const assetId = this.cachedIds[j]
      const i = this.bufferPositionsPerAssetIds[assetId]

      if (!assets[assetId]) {
        console.log('asset not found', assetId)
      } else {
        attr.array[i] = assets[assetId].tween ?? 1
      }
    }

    this.updateFlags.tween = false
    markRenderNeeded()
  }
}
