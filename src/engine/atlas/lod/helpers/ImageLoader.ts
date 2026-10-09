import type { LODDescriptor } from './LODDescriptor'
import type { LODAssetLike } from '../types'

/**
 * 通过 XHR 加载资源的图像，再解码为 `Image`，
 * 以便绘制到 LOD 纹理中。
 */
export type ImageLoaderCallback = (loader: ImageLoader) => void

export class ImageLoader {
  debug = false

  idle = true
  url: string | null = null
  asset: LODAssetLike | null = null

  // 图像解码完成后设置
  img: HTMLImageElement | null = null
  width = 0
  height = 0

  onComplete: ImageLoaderCallback | undefined
  onError: ImageLoaderCallback | undefined

  private readonly xhr: XMLHttpRequest

  constructor(onComplete?: ImageLoaderCallback, onError?: ImageLoaderCallback) {
    this.onComplete = onComplete
    this.onError = onError

    this.xhr = new XMLHttpRequest()
    this.xhr.onload = this.onload.bind(this)
    this.xhr.onerror = this.onerror.bind(this)
  }

  load(asset: LODAssetLike, lodDescriptor: LODDescriptor): void {
    this.idle = false
    this.img = new Image()
    this.asset = asset

    if (this.debug) {
      const scope = this
      setTimeout(function () {
        scope.onError?.(scope)
      }, 1)
      return
    }

    this.url = asset.image_url

    // 通过 `=s<size>` 后缀请求指定尺寸的图片
    let validUrl = (this.url as string).replace('http:', 'https:')
    validUrl += '=s' + lodDescriptor.tileSize

    this.xhr.open('GET', validUrl, true)
    this.xhr.responseType = 'blob'
    this.xhr.send()
  }

  onload(): void {
    const scope = this
    const img = scope.img as HTMLImageElement

    img.onload = function () {
      scope.idle = true
      scope.width = img.width
      scope.height = img.height

      if (scope.onComplete) {
        scope.onComplete(scope)
      }
    }

    img.src = window.URL.createObjectURL(scope.xhr.response as Blob)
  }

  onerror(_event?: unknown): void {
    if (this.onError) {
      this.onError(this)
    }
  }
}
