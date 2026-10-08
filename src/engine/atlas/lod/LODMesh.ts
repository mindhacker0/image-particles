import { Mesh as ThreeMesh, type Texture as ThreeTexture } from 'three'
import type { Asset } from '../Asset'
import { Material } from '../Material'
import { LODGeometry } from './LODGeometry'
import type { ImageDescriptor } from './helpers/ImageDescriptor'
import type { LODDescriptor } from './helpers/LODDescriptor'

/**
 * 某一细节层级的网格：持有 LOD 几何体与共享的图集材质。
 */

export class LODMesh {
  type = 'LODmesh'
  desc: LODDescriptor
  lod: number
  geometry: LODGeometry
  material: Material
  mesh: ThreeMesh

  constructor(desc: LODDescriptor, texture: ThreeTexture) {
    this.desc = desc
    this.lod = desc.lod

    this.geometry = new LODGeometry(desc)
    this.material = new Material(texture)

    this.mesh = new ThreeMesh(this.geometry.geometry, this.material.material)
    this.mesh.frustumCulled = false
  }

  append(imageDescriptors: ImageDescriptor[]): void {
    for (let i = 0; i < imageDescriptors.length; i++) {
      const imd = imageDescriptors[i]
      this.geometry.append(i, imd.asset as unknown as Asset, imd.w as number, imd.h as number)
    }
  }

  clear(): void {
    this.geometry.clear()
  }

  reset(newAssets: Asset[]): void {
    this.geometry.reset(newAssets)
  }

  update(): void {
    // TODO：更新属性
  }
}
