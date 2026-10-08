import { LinearFilter, Mesh as ThreeMesh } from 'three'
import { atlasInstance, markRenderNeeded } from '../legacyScope'
import { Asset } from './Asset'
import { Geometry } from './Geometry'
import { Material } from './Material'
import type { Texture } from './Texture'

/**
 * 静态图集网格：纹理中每个资产对应一个实例化四边形。
 * `MODMesh` 与 LOD 网格都继承本类。
 */

/** 累计创建的资产数量（诊断用）。 */
let totalAssets = 0

export class Mesh {
  type = 'mesh'
  lod = -1

  texture: Texture
  geometry: Geometry
  material: Material
  mesh: ThreeMesh

  // 按 id 索引资产的字典
  assets: Record<string, Asset> = {}

  transitionPctSpeed = 0.01
  transitionPct = 0
  startTime = Date.now()

  constructor(texture: Texture) {
    texture.texture.minFilter = LinearFilter
    texture.texture.magFilter = LinearFilter

    this.texture = texture
    this.geometry = new Geometry(this.texture)
    this.material = new Material(this.texture.texture)
    this.mesh = new ThreeMesh(this.geometry.geometry, this.material.material)
    this.mesh.frustumCulled = false

    this.setup()
  }

  setup(): void {
    // 归一化静态坐标
    const norm = (this.texture.assetSize as number) / 16

    for (let i = 0, l = this.texture.coords.length; i < l; i++) {
      const coords = this.texture.coords[i]
      coords.x *= norm
      coords.y *= norm
      coords.w *= norm
      coords.h *= norm

      // 临时处理图集中重复的资产：已存在则跳过
      if (atlasInstance().getAsset(coords.id as string)) {
        continue
      }

      const asset = new Asset({
        id: coords.id as string,
        coords,
      })
      asset.mesh = this
      this.geometry.append(asset, coords)

      // 更新字典索引
      this.assets[asset.id] = asset
    }

    totalAssets += this.texture.coords.length
  }

  update(): void {
    if (this.geometry.updateFlags.position || this.geometry.updateFlags.color) {
      this.geometry.applyAttributes(this.transitionPct)
      this.transitionPct = 0
      this.transitionPctSpeed = 0
    }

    if (this.geometry.updateFlags.position) {
      this.geometry.updatePositionAttributes(this.assets)
    }

    if (this.geometry.updateFlags.color) {
      this.geometry.updateColorAttributes(this.assets)
    }

    if (this.geometry.updateFlags.tween) {
      this.geometry.updateTweenAttributes(this.assets)
    }

    this.updateAnimation()
  }

  // 动画在 GPU 上完成：
  // 每个项都有 "position" 与 "destination" 两组 attribute，
  // "transitionPct" 表示两者之间的插值比例
  updateAnimation(): void {
    this.transitionPctSpeed += (0.03 - this.transitionPctSpeed) * 0.01
    this.transitionPct += (1 - this.transitionPct) * this.transitionPctSpeed

    if (this.transitionPct < 0.9999) {
      markRenderNeeded()
    } else {
      this.transitionPct = 1
    }

    const uniforms = this.material.material.uniforms
    uniforms.transitionPct.value = this.transitionPct
  }
}
