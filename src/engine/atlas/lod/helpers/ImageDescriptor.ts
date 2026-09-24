import type { LODAssetLike } from '../types'

/**
 * Data holder containing the image data associated to an asset at a given LOD.
 */
export class ImageDescriptor {
  asset: LODAssetLike | null
  id: string | null
  img: unknown
  w: number | null
  h: number | null
  color: string | null

  constructor(asset: LODAssetLike, img: unknown, w: number, h: number) {
    this.asset = asset
    this.id = asset.id
    this.img = img
    this.w = w
    this.h = h

    const chars = '6789ABCDEF'
    const r = chars.charAt(parseInt(String(Math.random() * chars.length), 10))
    const g = chars.charAt(parseInt(String(Math.random() * chars.length), 10))
    const b = chars.charAt(parseInt(String(Math.random() * chars.length), 10))
    this.color = '#' + r + g + b
  }

  dispose(): void {
    this.asset = null
    this.id = null
    this.img = null
    this.w = null
    this.h = null
    this.color = null
  }
}
