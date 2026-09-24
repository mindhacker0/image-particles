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
 *
 * Instanced geometry shared by the atlas meshes: one quad per asset, with an
 * attribute per animated property. The legacy code used the pre-r125 names
 * (`maxInstancedCount`, `addAttribute`, `setDynamic`) which are mapped onto the
 * current API here.
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

    // create the instanced buffer geometry
    this.geometry = new InstancedBufferGeometry()
    // `copy` only copies the attributes / index of the plain plane geometry
    this.geometry.copy(planeGeom as unknown as InstancedBufferGeometry)
    this.geometry.instanceCount = this.texture.getNumItemsMax()

    // flags dictionary for assets to report update needs
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

    // normalize threejs internal uvs attribute buffer
    const uvAttr = geom.getAttribute('uv') as BufferAttribute
    uvAttr.needsUpdate = true

    const norm = tex.assetSize as number / 16
    for (let i = 0; i < uvAttr.array.length; i++) {
      uvAttr.array[i] /= tex.width
      // set normalization relative to assetSize (required for LOD)
      uvAttr.array[i] *= norm
    }

    // define the shader attributes topology
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
      // allocate the buffer (the legacy 3rd argument was meshPerAttribute,
      // which now defaults to 1)
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

    // if this asset already has a slot available - that happens when we've
    // removed and are adding back an asset
    const positionInBuffer = this.bufferPositionsPerAssetIds[asset.id] !== undefined
      ? this.bufferPositionsPerAssetIds[asset.id]
      : this.getNextPosition(asset.id)

    // stores the asset's position in the attribute buffers
    asset.positionInbuffer = positionInBuffer

    const i1 = positionInBuffer
    const i2 = positionInBuffer * 2
    const i3 = positionInBuffer * 3

    // pct
    this.attributes['tween'].array[i1] = 1

    // coords
    const uvOffsets = this.attributes['uvOffset'].array
    const textureSize = this.texture.width
    uvOffsets[i2 + 0] = x / textureSize
    uvOffsets[i2 + 1] = (textureSize - y - h) / textureSize

    // size
    const scale = this.attributes['scale'].array
    const assetSize = this.texture.assetSize as number
    scale[i3 + 0] = Math.floor((w / assetSize) * 16)
    scale[i3 + 1] = Math.floor((h / assetSize) * 16)
    scale[i3 + 2] = 1

    // translation
    const p = asset.position
    for (const name of ['translate', 'translateDest']) {
      const buff = this.attributes[name].array
      buff[i3 + 0] = p.x
      buff[i3 + 1] = p.y
      buff[i3 + 2] = p.z
    }

    // color
    const c = asset.color
    for (const name of ['color', 'colorDest']) {
      const buff = this.attributes[name].array
      buff[i3 + 0] = c.r
      buff[i3 + 1] = c.g
      buff[i3 + 2] = c.b
    }

    // UID for color picking
    const uidBuff = this.attributes['uidColor'].array
    uidBuff[i3 + 0] = ((asset.uid >> 16) & 0xff) / 0xff
    uidBuff[i3 + 1] = ((asset.uid >> 8) & 0xff) / 0xff
    uidBuff[i3 + 2] = (asset.uid & 0xff) / 0xff

    // mark attributes for update
    for (const attr in this.attributes) {
      this.attributes[attr].needsUpdate = true
    }

    // set asset update flags to this one
    asset.updateFlags = this.updateFlags

    // discard cache array of ids
    this.cachedIds = null

    // append asset to 'position in buffer' dictionary
    this.bufferPositionsPerAssetIds[asset.id] = positionInBuffer
    return positionInBuffer
  }

  getNextPosition(_id: string): number {
    const pos = this.currPosition % this.geometry.instanceCount
    this.currPosition++
    return pos
  }

  // we can't actually remove the geometry so we just give a scale 0 to the
  // instance attribute
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

  // called when the asset is not available anymore in this geometry -
  // only happens on dynamic textures such as LOD
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

      // position
      transArr[i3 + 0] = transDestArr[i3 + 0] * pct + transArr[i3 + 0] * (1 - pct)
      transArr[i3 + 1] = transDestArr[i3 + 1] * pct + transArr[i3 + 1] * (1 - pct)
      transArr[i3 + 2] = transDestArr[i3 + 2] * pct + transArr[i3 + 2] * (1 - pct)

      // color
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
