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
 * 处理某一细节层级（LOD）资源的加载与显示：
 * 将图像加入队列、重建 LOD 纹理并切换网格属性。
 */
export class LODItem {
  desc: LODDescriptor
  lod: number
  tileSize: number
  tileCount: number

  loaderPool: LoaderPool
  imagePool: ImagePool

  // 需要提交到纹理的图像描述符
  flushPool: ImageDescriptor[] = []

  texture: LODTexture
  mesh: LODMesh

  // 资源列表
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

    // 图像加载器池
    this.loaderPool = new LoaderPool(desc, Math.min(desc.tileCount, 8))

    // 监听图像加载事件
    this.loaderPool.events.addListener(LoaderPool.IMAGE_LOADED, this.onImageLoaded.bind(this) as never)
    this.loaderPool.events.addListener(LoaderPool.IMAGE_ERROR, this.onImageError.bind(this) as never)
    this.loaderPool.events.addListener(LoaderPool.QUEUE_LOADED, this.onQueueLoaded.bind(this) as never)

    // imagePool：已加载图像的字典，此处设置缓存上限
    const cacheLimit = Math.max(8, this.tileCount * 2)
    this.imagePool = new ImagePool(cacheLimit)

    // 创建纹理
    this.texture = new LODTexture(desc)

    // 创建网格
    this.mesh = new LODMesh(desc, this.texture.texture)

    // 把网格加入场景
    container3D.add(this.mesh.mesh)

    // 并加入图集的网格池
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
    // 队列加载完成的通知入口，此处无需额外处理
  }

  /// 更新

  update(newAssets: LODAssetLike[]): void {
    const scope = this

    this.assets = []
    this.flushPool = []

    // 加载
    // 需要下载的资源列表
    const assetsToLoad: LODAssetLike[] = []
    // 尚无 URL 的资源列表
    const missingIds: string[] = []

    // 步骤 1：加载还是直接显示？
    newAssets.forEach(function (asset) {
      // 把当前 LOD 层级赋给该资源
      if (asset.lod === scope.lod) {
        // 该文件尚未下载
        if (scope.imagePool.get(asset.id) == null) {
          // 需要加入加载队列
          assetsToLoad.push(asset)

          // 若该资源从未加载过（其他 LOD 也没有），需要查找它的图像 URL
          if (asset.image_url == null && asset.valid) {
            // 记录资源 id，交给 getUrlsDict(missingIds) 解析
            missingIds.push(asset.id)
          }
        } else {
          // 图像已加载：资源有效时直接使用
          if (scope.checkAsset(asset)) {
            scope.addAsset(asset)
          }
        }
      }
    })

    this.load(assetsToLoad, missingIds)

    // 步骤 1 结束

    // 步骤 2：若该纹理仍有空位
    if (this.assets.length < this.tileCount) {
      // 提升缓存中已有的低 LOD 项
      newAssets.forEach(function (asset) {
        // 该资源属于其他 LOD，尚未处理
        if (asset.drawn) return

        if (asset.lod !== scope.lod) {
          if (scope.checkAsset(asset)) {
            scope.addAsset(asset)
          }
        }
      })
    }

    // 显示新资源
    this.mesh.reset(this.assets as unknown as Asset[])
    this.mesh.append(this.flushPool)
    this.imagePool.clean(this.desc.lod)
    this.display()
  }

  checkAsset(asset: LODAssetLike): boolean {
    // 已在列表中
    if (this.assets.indexOf(asset) !== -1) return false

    // 正在绘制
    if (asset.drawn) return false

    // 不需要显示
    if (!asset.needed) return false

    // 纹理上没有足够空位
    if (this.assets.length > this.tileCount - 1) return false

    // 是否已缓存？
    const imd = this.imagePool.get(asset.id)
    if (imd == null) return false

    return true
  }

  addAsset(asset: LODAssetLike): void {
    // 加入列表
    asset.drawn = true
    asset.needed = false
    this.assets.push(asset)

    const imd = this.imagePool.get(asset.id)
    if (imd) this.flushPool.push(imd)
  }

  load(assetsToLoad: LODAssetLike[], missingIds: string[]): void {
    const scope = this

    if (missingIds.length > 0) {
      // 查找缺失的 URL 并加载新图像
      const fromAllChannels = false

      getUrlsDict(
        missingIds,
        function () {
          // 实际文件 URL 通过 modelItems()[asset.id] 提供
          assetsToLoad.forEach(function (asset) {
            const items = modelItems()

            if (items[asset.id] && items[asset.id].image_url) {
              // 在资源上保存该图像 URL 的引用
              const atlasAsset = atlasInstance().getAsset(asset.id) as unknown as
                | LODAssetLike
                | undefined
              if (atlasAsset) {
                atlasAsset.image_url = items[asset.id].image_url as string
              }
            } else {
              // 该资源没有 image_url
              if (asset.valid) {
                console.warn('asset: ' + asset.id + ' has no image URL')
              }
              asset.valid = false
            }
          })

          // 执行这一批加载
          scope.loaderPool.load(assetsToLoad)
        },
        fromAllChannels,
      )
    } else {
      // 执行这一批加载
      this.loaderPool.load(assetsToLoad)
    }
  }

  /** 空的占位实现，当前没有任何调用方。 */
  updateAttributes(): void {}

  reset(): void {
    this.mesh.reset([])
    this.texture.reset()
  }

  display(): void {
    this.texture.rebuildTexture(this.flushPool)
  }
}
