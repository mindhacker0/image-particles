import { EventDispatcher } from '../../../utils/events'
import { ImageLoader } from './ImageLoader'
import type { LODAssetLike } from '../types'

/**
 * Keeps a fixed number of `ImageLoader`s busy with a queue of assets.
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
    // loads next item in queue
    const asset = this.queue.shift()
    if (asset) {
      loader.load(asset, this.LODDescriptor as never)
    }

    // if all loaders have finished
    if (this.queue.length === 0) {
      let over = true
      this.loaders.forEach(function (current) {
        if (!current.idle) over = false
      })

      // notify the LODItem that all is loaded
      if (over) {
        this.events.dispatch(LoaderPool.QUEUE_LOADED)
      }
    }
  }

  load(assets: LODAssetLike[]): void {
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
