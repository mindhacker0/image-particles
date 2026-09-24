import { EventDispatcher } from '../../utils/events'
import { atlasInstance, modelItems } from '../../legacyScope'
import type { Asset } from '../Asset'
import { getUrlsDict } from '../utils'
import { ImageDescriptor } from './helpers/ImageDescriptor'
import { ImagePool } from './helpers/ImagePool'
import { LoaderPool } from './helpers/LoaderPool'
import type { LODDescriptor } from './helpers/LODDescriptor'
import type { ImageLoader } from './helpers/ImageLoader'
import { LODMesh } from './LODMesh'
import { LODTexture } from './LODTexture'
import type { LODAssetLike } from './types'

/**
 *
 * Handles the loading and the display of the assets of one level of detail:
 * queues the images, rebuilds the LOD texture and swaps the mesh attributes.
 */
export class LODItem {
  desc: LODDescriptor
  lod: number
  tileSize: number
  tileCount: number

  loaderPool: LoaderPool
  imagePool: ImagePool

  // image descriptors that need to be committed to the texture
  flushPool: ImageDescriptor[] = []

  texture: LODTexture
  mesh: LODMesh

  // asset list
  assets: LODAssetLike[] = []

  initialUpdate = true
  events = new EventDispatcher()

  constructor(
    desc: LODDescriptor,
    container3D: { add(object: unknown): void },
    atlasMeshes: LODMesh[],
  ) {
    this.desc = desc
    this.lod = desc.lod
    this.tileSize = desc.tileSize
    this.tileCount = desc.tileCount

    // image loader pool
    this.loaderPool = new LoaderPool(desc, Math.min(desc.tileCount, 8))

    // monitor image loading
    this.loaderPool.events.addListener(LoaderPool.IMAGE_LOADED, this.onImageLoaded.bind(this) as never)
    this.loaderPool.events.addListener(LoaderPool.IMAGE_ERROR, this.onImageError.bind(this) as never)
    this.loaderPool.events.addListener(LoaderPool.QUEUE_LOADED, this.onQueueLoaded.bind(this) as never)

    // imagePool: a dictionary of the images that have already been loaded
    // maximum amount of items that can be stored in cache
    const cacheLimit = Math.max(8, this.tileCount * 2)
    this.imagePool = new ImagePool(cacheLimit)

    // creates a texture
    this.texture = new LODTexture(desc)

    // creates a mesh
    this.mesh = new LODMesh(desc, this.texture.texture)

    // adds mesh to stage
    container3D.add(this.mesh.mesh)

    // and to the atlas' mesh pool
    atlasMeshes.push(this.mesh)
  }

  onImageLoaded(loader: ImageLoader): void {
    const img = loader.img
    const w = loader.width
    const h = loader.height

    const imageDescriptor = new ImageDescriptor(
      loader.asset as LODAssetLike,
      img,
      w,
      h,
    )
    this.imagePool.add(imageDescriptor)
  }

  onImageError(loader: ImageLoader): void {
    const img = null
    const w = this.desc.tileSize
    const h = this.desc.tileSize

    const imageDescriptor = new ImageDescriptor(
      loader.asset as LODAssetLike,
      img,
      w,
      h,
    )
    this.imagePool.add(imageDescriptor)
  }

  onQueueLoaded(_loader?: unknown): void {
    // the original only logged here
  }

  /// update

  update(newAssets: LODAssetLike[]): void {
    const scope = this

    this.assets = []
    this.flushPool = []

    // LOAD
    // list of the assets that need to be downloaded
    const assetsToLoad: LODAssetLike[] = []
    // lists of assets that don't have a url yet
    const missingIds: string[] = []

    // step1: load or display?
    newAssets.forEach(function (asset) {
      // assigns this LOD level to the asset
      if (asset.lod === scope.lod) {
        // if this file hasn't been downloaded yet
        if (scope.imagePool.get(asset.id) == null) {
          // we'll have to load this
          assetsToLoad.push(asset)

          // if the asset has never been loaded (in another LOD) we need to find
          // its image url
          if (asset.image_url == null && asset.valid) {
            // so we store the asset's id and send it to getUrlsDict(missingIds)
            missingIds.push(asset.id)
          }
        } else {
          // this image was already loaded: if the asset is valid
          if (scope.checkAsset(asset)) {
            scope.addAsset(asset)
          }
        }
      }
    })

    this.load(assetsToLoad, missingIds)

    // end step 1

    // step2: if there is still room in this texture
    if (this.assets.length < this.tileCount) {
      // promote any items of a lower LOD that exists in this cache
      newAssets.forEach(function (asset) {
        // this asset belongs to another LOD and was not processed
        if (asset.drawn) return

        if (asset.lod !== scope.lod) {
          if (scope.checkAsset(asset)) {
            scope.addAsset(asset)
          }
        }
      })
    }

    // displays the new assets
    this.mesh.reset(this.assets as unknown as Asset[])
    this.mesh.append(this.flushPool)
    this.imagePool.clean(this.desc.lod)
    this.display()
  }

  checkAsset(asset: LODAssetLike): boolean {
    // already there
    if (this.assets.indexOf(asset) !== -1) return false

    // already being drawn
    if (asset.drawn) return false

    // not needed...
    if (!asset.needed) return false

    // not enough room for it on the texture
    if (this.assets.length > this.tileCount - 1) return false

    // in cache?
    const imd = this.imagePool.get(asset.id)
    if (imd == null) return false

    return true
  }

  addAsset(asset: LODAssetLike): void {
    // adds it
    asset.drawn = true
    asset.needed = false
    this.assets.push(asset)

    const imd = this.imagePool.get(asset.id)
    if (imd) this.flushPool.push(imd)
  }

  load(assetsToLoad: LODAssetLike[], missingIds: string[]): void {
    const scope = this

    if (missingIds.length > 0) {
      // finds the missing urls and loads the new images
      const fromAllChannels = false

      getUrlsDict(
        missingIds,
        function () {
          // the actual file urls are made available through Model.items[asset.id]
          assetsToLoad.forEach(function (asset) {
            const items = modelItems()

            if (items[asset.id] && items[asset.id].image_url) {
              // stores a reference to the image's url in the asset
              const atlasAsset = atlasInstance().getAsset(asset.id) as unknown as
                | LODAssetLike
                | undefined
              if (atlasAsset) {
                atlasAsset.image_url = items[asset.id].image_url as string
              }
            } else {
              // this asset has no image_url...
              if (asset.valid) {
                console.warn('asset: ' + asset.id + ' has no image URL')
              }
              asset.valid = false
            }
          })

          // calls the load batch
          scope.loaderPool.load(assetsToLoad)
        },
        fromAllChannels,
      )
    } else {
      // calls the load batch
      this.loaderPool.load(assetsToLoad)
    }
  }

  /**
   * The original called `this.mesh.geometry.updateAttributes()`, which does not
   * exist on the LOD geometry, so calling it always threw. Nothing calls this
   * method, it is kept as a documented no-op.
   */
  updateAttributes(): void {}

  reset(): void {
    this.mesh.reset([])
    this.texture.reset()
  }

  display(): void {
    this.texture.rebuildTexture(this.flushPool)
  }
}
