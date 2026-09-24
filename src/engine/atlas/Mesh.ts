import { LinearFilter, Mesh as ThreeMesh } from 'three'
import { atlasInstance, markRenderNeeded } from '../legacyScope'
import { Asset } from './Asset'
import { Geometry } from './Geometry'
import { Material } from './Material'
import type { Texture } from './Texture'

/**
 *
 * Static atlas mesh: one instanced quad per asset of the texture. `MODMesh` and
 * the LOD meshes extend this class, so it stays a class with the same members.
 */

let totalAssets = 0

export class Mesh {
  type = 'mesh'
  lod = -1

  texture: Texture
  geometry: Geometry
  material: Material
  mesh: ThreeMesh

  // dictionary to retrieve assets by their ids
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
    // normalize static coordinates
    const norm = (this.texture.assetSize as number) / 16

    for (let i = 0, l = this.texture.coords.length; i < l; i++) {
      const coords = this.texture.coords[i]
      coords.x *= norm
      coords.y *= norm
      coords.w *= norm
      coords.h *= norm

      //TODO(cdiagne@): cleaner handling of duplicated assets in atlases
      // this is a tempfix for TED
      if (atlasInstance().getAsset(coords.id as string)) {
        continue
      }

      const asset = new Asset({
        id: coords.id as string,
        coords,
      })
      asset.mesh = this
      this.geometry.append(asset, coords)

      // update our dictionary indexes
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

  // animation is done on the gpu
  // all items have a "position" and "destination" attribute
  // "transitionPct" defines the percentage between these 2 position
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
