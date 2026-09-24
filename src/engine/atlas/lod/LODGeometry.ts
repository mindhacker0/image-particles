import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type BufferAttribute,
} from 'three'
import { markRenderNeeded } from '../../legacyScope'
import type { Asset } from '../Asset'
import type { LODDescriptor } from './helpers/LODDescriptor'

/**
 *
 * Instanced geometry of one level of detail: one tile per image descriptor.
 * The legacy code used the pre-r125 names (`maxInstancedCount`, `addAttribute`,
 * `setDynamic`); the port uses the current API.
 */

const planeGeom = new PlaneGeometry(1, 1)

interface GeometryAttributeDescription {
  name: string
  size: number
  isStatic?: boolean
}

export class LODGeometry {
  desc: LODDescriptor
  tileSize: number
  geometry: InstancedBufferGeometry
  updateFlags: { position: boolean; color: boolean; tween: boolean }
  attributes: Record<string, InstancedBufferAttribute> = {}
  currPosition = 0
  // list of assets being displayed
  assetList: Asset[] = []

  constructor(desc: LODDescriptor) {
    this.desc = desc
    this.tileSize = this.desc.tileSize

    // create the instanced buffer geometry
    this.geometry = new InstancedBufferGeometry()
    // `copy` only copies the attributes / index of the plain plane geometry
    this.geometry.copy(planeGeom as unknown as InstancedBufferGeometry)
    this.geometry.instanceCount = desc.tileCount

    // flags dictionary for assets to report update needs
    this.updateFlags = {
      position: false,
      color: false,
      tween: false,
    }

    this.setup()
  }

  setup(): void {
    const geom = this.geometry
    const uvAttr = geom.getAttribute('uv') as BufferAttribute
    const norm = this.desc.tileSize / 16

    for (let i = 0; i < uvAttr.array.length; i++) {
      uvAttr.array[i] /= this.desc.textureSize
      // set normalization relative to assetSize (required for LOD)
      uvAttr.array[i] *= norm
    }
    uvAttr.needsUpdate = true

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

    const scope = this

    attributes.forEach(function (attr) {
      const buffer = new Float32Array(geom.instanceCount * attr.size)
      // (the legacy 3rd argument was meshPerAttribute, which now defaults to 1)
      const buffAttr = new InstancedBufferAttribute(buffer, attr.size)

      if (!attr.isStatic) {
        buffAttr.setUsage(DynamicDrawUsage)
      }

      geom.setAttribute(attr.name, buffAttr)
      scope.attributes[attr.name] = buffAttr
    })
  }

  append(positionInBuffer: number, asset: Asset, w: number, h: number): void {
    const textureSize = this.desc.textureSize
    const tileSize = this.desc.tileSize

    const row = textureSize / tileSize
    const x = parseInt(String(positionInBuffer % row), 10) * tileSize
    const y = parseInt(String(positionInBuffer / row), 10) * tileSize

    const i1 = positionInBuffer
    const i2 = positionInBuffer * 2
    const i3 = positionInBuffer * 3

    let buff: Float32Array
    const scope = this

    // pct
    this.attributes['tween'].array[i1] = 1

    // coords
    const uvOffsets = this.attributes['uvOffset'].array
    uvOffsets[i2] = x / textureSize
    uvOffsets[i2 + 1] = (textureSize - y - h) / textureSize

    // size
    const scale = this.attributes['scale'].array
    scale[i3] = (w / tileSize) * 16
    scale[i3 + 1] = (h / tileSize) * 16
    scale[i3 + 2] = 1

    // translation
    const p = asset.position
    ;['translate', 'translateDest'].forEach(function (name) {
      buff = scope.attributes[name].array as Float32Array
      buff[i3] = p.x
      buff[i3 + 1] = p.y
      buff[i3 + 2] = p.z
    })

    // color
    const c = asset.color
    ;['color', 'colorDest'].forEach(function (name) {
      buff = scope.attributes[name].array as Float32Array
      buff[i3] = c.r
      buff[i3 + 1] = c.g
      buff[i3 + 2] = c.b
    })

    // UID for color picking
    buff = this.attributes['uidColor'].array as Float32Array
    buff[i3] = ((asset.uid >> 16) & 0xff) / 0xff
    buff[i3 + 1] = ((asset.uid >> 8) & 0xff) / 0xff
    buff[i3 + 2] = (asset.uid & 0xff) / 0xff

    // mark attributes for update
    for (const attr in this.attributes) {
      this.attributes[attr].needsUpdate = true
    }

    // set asset update flags to this one
    asset.updateFlags = this.updateFlags

    // stores a reference to the asset
    if (this.assetList.indexOf(asset) !== -1) return
    this.assetList.push(asset)
  }

  remove(asset: Asset, _positionInBuffer?: number): void {
    this.hide(asset)
  }

  hide(asset: Asset): void {
    const positionInbuffer = this.assetList.indexOf(asset)

    if (positionInbuffer === -1) {
      // the original logged `this.lod`, which does not exist on a geometry
      console.warn('hide:', this.desc.lod, "this asset doesn't belong to any geometry")
      return
    }

    const i = positionInbuffer * 3
    const scaleBuffer = this.attributes['scale']
    scaleBuffer.array[i] = scaleBuffer.array[i + 1] = 0
    scaleBuffer.array[i + 2] = 1
    scaleBuffer.needsUpdate = true
  }

  show(asset: Asset): void {
    const positionInbuffer = this.assetList.indexOf(asset)

    if (positionInbuffer === -1) {
      console.warn('show:', this.desc.lod, "this asset doesn't belong to any geometry")
      return
    }

    const i = positionInbuffer * 3
    const scaleBuffer = this.attributes['scale']
    const tileSize = this.tileSize

    scaleBuffer.array[i] = Math.floor((asset.coords.w / tileSize) * 16)
    scaleBuffer.array[i + 1] = Math.floor((asset.coords.h / tileSize) * 16)
    scaleBuffer.array[i + 2] = 1
    scaleBuffer.needsUpdate = true
  }

  clear(): void {
    const scale = this.attributes['scale'].array

    for (let i = 0; i < this.desc.tileCount * 3; i += 3) {
      scale[i] = scale[i + 1] = 0
      scale[i + 2] = 1
    }

    this.attributes['scale'].needsUpdate = true
  }

  reset(newAssets: Asset[]): void {
    this.clear()

    this.assetList = newAssets
    const scope = this

    newAssets.forEach(function (asset) {
      asset.hide() // remove from default geometry
      scope.show(asset) // adds to this geometry
    })

    this.attributes['scale'].needsUpdate = true
  }

  applyAttributes(pct: number): void {
    const colorArr = this.attributes['color'].array
    const transArr = this.attributes['translate'].array
    const colorDestArr = this.attributes['colorDest'].array
    const transDestArr = this.attributes['translateDest'].array

    for (let i = 0; i < this.desc.tileCount; i++) {
      const i3 = i * 3

      // position
      transArr[i3] = transDestArr[i3] * pct + transArr[i3] * (1 - pct)
      transArr[i3 + 1] = transDestArr[i3 + 1] * pct + transArr[i3 + 1] * (1 - pct)
      transArr[i3 + 2] = transDestArr[i3 + 2] * pct + transArr[i3 + 2] * (1 - pct)

      // color
      colorArr[i3] = colorDestArr[i3] * pct + colorArr[i3] * (1 - pct)
      colorArr[i3 + 1] = colorDestArr[i3 + 1] * pct + colorArr[i3 + 1] * (1 - pct)
      colorArr[i3 + 2] = colorDestArr[i3 + 2] * pct + colorArr[i3 + 2] * (1 - pct)
    }

    this.attributes['translate'].needsUpdate = true
    this.attributes['color'].needsUpdate = true

    markRenderNeeded()
  }

  /**
   * Kept as in the original, where `assets` is indexed both as an array and as a
   * dictionary keyed by id, which makes the loop a no-op for object input.
   */
  updateAttribute(
    assets: Record<string, { position: { x: number; y: number; z: number } }>,
    attributeName: string,
    assetProperty: string,
  ): void {
    const attr = this.attributes[attributeName]
    const list = assets as unknown as Array<{ id: string }>

    for (let i = 0; i < list.length; i++) {
      const asset = list[i]
      const assetId = asset.id
      const i3 = i * 3

      const source = assets[assetId][assetProperty] as { x: number; y: number; z: number }
      attr.array[i3] = source.x
      attr.array[i3 + 1] = source.y
      attr.array[i3 + 2] = source.z
    }

    attr.needsUpdate = true
    markRenderNeeded()
  }

  updatePositionAttributes(assets: Record<string, { position: { x: number; y: number; z: number } }>): void {
    this.updateAttribute(assets, 'translateDest', 'position')
    this.updateFlags.position = false
  }

  updateColorAttributes(assets: Record<string, { position: { x: number; y: number; z: number } }>): void {
    this.updateAttribute(assets, 'colorDest', 'position')
    this.updateFlags.color = false
  }

  /**
   * The original read `this.attributes[attributeName]` here, referencing a
   * variable that only exists in `updateAttribute`, so the method always threw.
   * It is ported with the obvious intent, the `tween` attribute.
   */
  updateTweenAttributes(assets: Array<{ tween?: number }>): void {
    const attr = this.attributes['tween']

    for (let i = 0; i < this.desc.tileCount; i++) {
      attr.array[i] = assets[i]?.tween ?? 1
    }

    this.updateFlags.tween = false
    attr.needsUpdate = true
    markRenderNeeded()
  }
}
