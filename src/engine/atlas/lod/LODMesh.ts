import { Mesh as ThreeMesh, type Texture as ThreeTexture } from 'three'
import type { Asset } from '../Asset'
import { Material } from '../Material'
import { LODGeometry } from './LODGeometry'
import type { ImageDescriptor } from './helpers/ImageDescriptor'
import type { LODDescriptor } from './helpers/LODDescriptor'

/**
 *
 * Mesh of one level of detail: holds the LOD geometry and the shared atlas
 * material. The legacy prototype methods (`append`, `clear`, `reset`, `update`)
 * keep their names.
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
    //TODO update attributes
  }
}
