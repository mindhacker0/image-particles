import { EventDispatcher } from '../../../utils/events'
import { ImageLoader } from './ImageLoader'
import type { LODAssetLike } from '../types'

/**
 * 用固定数量的 `ImageLoader` 并发消费一个资产队列，
 * 从而限制同时进行的请求数量。
 */
export class LoaderPool {
  static readonly QUEUE_LOADED = 'queueLoaded'
  static readonly IMAGE_LOADED = 'imageLoaded'
  static readonly IMAGE_ERROR = 'imageError'

  LODDescriptor: { tileSize: number }
  loadCount = 0
  queue: LODAssetLike[] = []
  loaders: ImageLoader[] = []
  count: number
  events = new EventDispatcher()

  constructor(lodDescriptor: { tileSize: number }, count?: number) {
    this.LODDescriptor = lodDescriptor
    this.count = count || 1

    for (let i = 0; i < this.count; i++) {
      const loader = new ImageLoader(
        this.onLoaderComplete.bind(this),
        this.onLoaderError.bind(this),
      )
      this.loaders.push(loader)
    }
  }

  onLoaderComplete(loader: ImageLoader): void {
    this.events.dispatch(LoaderPool.IMAGE_LOADED, loader)
    this.loadCount++

    this.loadNext(loader)
  }

  onLoaderError(loader: ImageLoader): void {
    this.events.dispatch(LoaderPool.IMAGE_ERROR, loader)
    loader.idle = true
    this.loadNext(loader)
  }

  loadNext(loader: ImageLoader): void {
    // 加载队列中的下一项
    const asset = this.queue.shift()
    if (asset) {
      loader.load(asset, this.LODDescriptor as never)
    }

    // 若所有加载器都已空闲
    if (this.queue.length === 0) {
      let over = true
      this.loaders.forEach(function (current) {
        if (!current.idle) over = false
      })

      // 通知 LODItem 全部加载完成
      if (over) {
        this.events.dispatch(LoaderPool.QUEUE_LOADED)
      }
    }
  }

  load(assets: LODAssetLike[]): void {
    // 把有效资产加入队列，并让空闲的加载器立即开始工作
    const scope = this

    assets.forEach(function (asset) {
      if (asset.valid && scope.queue.indexOf(asset)) {
        scope.queue.push(asset)
      }
    })

    this.loaders.forEach(function (loader) {
      if (loader.idle) {
        const asset = scope.queue.shift()
        if (asset) {
          loader.load(asset, scope.LODDescriptor as never)
        }
      }
    })
  }
}
