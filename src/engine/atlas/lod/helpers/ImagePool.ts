import type { ImageDescriptor } from './ImageDescriptor'
import type { LODAssetLike } from '../types'

/**
 * 缓存某一 LOD 的 `ImageDescriptor`。
 */
export class ImagePool {
  limit: number
  hash: Record<string, ImageDescriptor | null> = {}
  assets: LODAssetLike[] = []

  constructor(limit?: number) {
    this.limit = limit || 16
  }

  /** 存入缓存并记录其资源。 */
  add(imgDescriptor: ImageDescriptor): void {
    if (imgDescriptor.id == null) {
      return
    }

    this.hash[imgDescriptor.id] = imgDescriptor
    this.assets.push(imgDescriptor.asset as LODAssetLike)
  }

  /** 按 id 取回缓存项，缺失时返回 null。 */
  get(id: string): ImageDescriptor | null {
    if (this.hash[id]) return this.hash[id]
    return null
  }

  /** 超出上限时清理尚未绘制的缓存项。 */
  clean(_lod?: number): void {
    if (this.assets.length > this.limit) {
      let deletion = 0
      const tmp: LODAssetLike[] = []

      for (let i = 0; i < this.assets.length; i++) {
        const asset = this.assets[i]

        if (!asset.drawn && this.assets.length - deletion > this.limit) {
          const firstId = asset.id
          if (this.hash[firstId] != null) {
            ;(this.hash[firstId] as ImageDescriptor).dispose()
          }
          this.hash[firstId] = null
          delete this.hash[firstId]

          deletion++
        } else {
          tmp.push(asset)
        }
      }

      this.assets = tmp
    }
  }
}
