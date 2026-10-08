import { Quaternion, Vector3 } from 'three'
import { EventDispatcher } from '../../utils/events'
import { atlasAssets, legacyCamera, legacyCameraControls, legacyParams } from '../../legacyScope'
import { map } from '../../utils/math'
import { gridSize } from '../Asset'
import { LoaderPool } from './helpers/LoaderPool'
import { LODDescriptor } from './helpers/LODDescriptor'
import { LODItem } from './LODItem'
import type { LODAssetLike } from './types'

/**
 * 为附近的艺术作品（通过 `getOnScreen` / `collectGridItems` 筛选）加载更高分辨率的图像，
 * 实际解码由 LODMesh 类完成。
 */

/** 图集资产，额外包含 LOD 网格查询所需的成员。 */
interface GridAsset extends LODAssetLike {
  grid: { x: number; y: number; z: number }
  cameraDistance: number
  position: Vector3
  hide(): void
  show(): void
}

interface LodExports {
  init(
    lodDescriptors: LODDescriptor[] | null | undefined,
    container3D: { add(object: unknown): void },
    atlasMeshes: unknown[],
    debug?: boolean,
  ): void
  loadAsset(asset: GridAsset, callback: () => void): void
  onAssetLoaded(): void
  addListener(event: string, callback: (...args: unknown[]) => void): void
  removeListener(event: string, callback: (...args: unknown[]) => void): void
  setFromCamera(): void
  clear(): void
  info(): void
  events: EventDispatcher
  minimumLODResolution: number
  minRange: number
  maxRange: number
}

let descriptors: LODDescriptor[] = []
let lods: LODItem[] = []
let currentItems: GridAsset[] | null = null

let minRange = Number.POSITIVE_INFINITY
let maxRange = Number.NEGATIVE_INFINITY
let minRangeSquare = 0
let maxRangeSquare = 0

let busy = true

let tmpAsset: GridAsset | null = null
let tmpCallback: (() => void) | null = null

export const lod: LodExports = {
  events: new EventDispatcher(),
  minimumLODResolution: 0,
  minRange: 0,
  maxRange: 0,

  init(lodDescriptors, container3D, atlasMeshes, _debug) {
    // 创建一组 LOD 层级
    let level = 0
    descriptors = lodDescriptors || [
      new LODDescriptor(level++, 1024, 1024, 200),
      new LODDescriptor(level++, 256, 1024, 200),
      new LODDescriptor(level++, 128, 2048, 2500),
      // 第 4 个层级（64px 图块、最多 5000 个）当前未启用：
      // new LODDescriptor( level++,   64, 2048, 5000 )
    ]

    if (legacyParams().isBigWallVersion) {
      // TODO：bigWall 版本参数
    }

    // 可以显示元数据的最小分辨率
    lod.minimumLODResolution = descriptors[1].tileSize

    // 为每个 LOD 描述符创建一个 LODItem
    lods = []
    let loaders = 0
    let maxTiles = 0
    let cacheSize = 0

    descriptors.forEach(function (desc) {
      const lodItem = new LODItem(desc, container3D, atlasMeshes as never)
      lods.push(lodItem)

      loaders += lodItem.loaderPool.loaders.length
      maxTiles += desc.tileCount
      cacheSize += lodItem.imagePool.limit

      minRange = Math.min(desc.range, minRange)
      maxRange = Math.max(desc.range, maxRange)
    })

    lod.minRange = minRange
    lod.maxRange = maxRange

    minRangeSquare = Math.pow(minRange, 2)
    maxRangeSquare = Math.pow(maxRange, 2)

    void loaders
    void maxTiles
    void cacheSize

    busy = false
  },

  loadAsset(asset, callback) {
    tmpAsset = asset
    tmpCallback = callback

    asset.lod = 0
    lods[0].loaderPool.events.addListener(LoaderPool.QUEUE_LOADED, lod.onAssetLoaded as never)
    lods[0].update([asset])
  },

  onAssetLoaded() {
    lods[0].loaderPool.events.removeListener(LoaderPool.QUEUE_LOADED, lod.onAssetLoaded as never)
    lods[0].display()

    ;(tmpAsset as GridAsset).hide()

    // 构造按尺寸分组的对象，用于更新元数据
    const assetsBySize: Record<string, string[]> = {}
    assetsBySize[lods[0].tileSize] = [(tmpAsset as GridAsset).id]

    // 派发事件以更新元数据
    lod.events.dispatch('update', { assets: assetsBySize })

    if (tmpCallback) tmpCallback()
  },

  addListener(event, callback) {
    lods.forEach(function (lodItem) {
      lodItem.loaderPool.events.addListener(event, callback as never)
    })
  },

  removeListener(event, callback) {
    lods.forEach(function (lodItem) {
      lodItem.loaderPool.events.removeListener(event, callback as never)
    })
  },

  /** 用当前屏幕上可见的资产更新各 LODItem。 */
  setFromCamera() {
    if (legacyCameraControls().tweening) return
    if (busy) return
    busy = true

    // 获取当前屏幕上可见的资产列表
    const newItems = getOnScreen(legacyCamera() as never)

    if (newItems == null) {
      busy = false
      return
    }

    // 重置各项的 LOD
    if (currentItems) {
      // 重置上一帧列表
      lod.clear()

      newItems.forEach(function (asset) {
        asset.needed = true
        asset.drawn = false
      })

      currentItems = newItems
    } else {
      currentItems = newItems
    }

    // 构造按尺寸分组的对象，用于更新元数据
    const assetsBySize: Record<string, string[]> = {}

    // 按 LOD 逐个更新
    lods.forEach(function (lodItem, id) {
      // 先触发加载，再更新网格与纹理
      lodItem.update(currentItems as GridAsset[])

      // 准备用于更新元数据的对象
      const maxRangeForLod = Math.pow(descriptors[id].range, 2)

      assetsBySize[lodItem.tileSize] = (lodItem.assets as GridAsset[])
        .filter(function (asset) {
          return asset.cameraDistance < maxRangeForLod
        })
        .map(function (asset) {
          return asset.id
        })
    })

    // 派发事件以更新元数据
    lod.events.dispatch('update', { assets: assetsBySize })

    // 更新地址栏 URL
    legacyCameraControls().toUrl()

    busy = false
  },

  clear() {
    if (currentItems == null) return

    lods.forEach(function (lodItem) {
      lodItem.reset()
    })

    currentItems.forEach(function (asset) {
      asset.needed = false
      asset.drawn = false
      asset.show()
    })
  },

  info() {
    let str = ''
    lods.forEach(function (lodItem, i) {
      str += 'lod : ' + i + ' queue length: ' + lodItem.loaderPool.queue.length
      str += ' cache length: ' + lodItem.imagePool.assets.length + '\n'
    })
    console.log(str)
  },
}

/**
 * 收集某个 3D 位置附近的资产。
 *
 * @param position 需要检查的位置
 * @param results 用于存放该位置附近资产的数组
 */
function collectGridItems(position: { x: number; y: number; z: number }, results: GridAsset[]): GridAsset[] {
  const offset = 50

  const x = parseInt(String(map(position.x, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
  const minx = x - offset
  const maxx = x + offset

  const y = parseInt(String(map(position.y, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
  const miny = y - offset
  const maxy = y + offset

  const z = parseInt(String(map(position.z, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
  const minz = z - offset
  const maxz = z + offset

  const assets = atlasAssets() as unknown as GridAsset[]

  for (let i = 0, len = assets.length; i < len; i++) {
    const asset = assets[i]

    if (asset.grid.x < minx) continue
    if (asset.grid.x > maxx) continue

    if (asset.grid.y < miny) continue
    if (asset.grid.y > maxy) continue

    if (asset.grid.z < minz) continue
    if (asset.grid.z > maxz) continue

    results.push(asset)
  }

  return results
}

// 允许多收集屏幕外最多 25% 的项
const bound = 1.25
const vertex = new Vector3()
const frontVec = new Vector3(0, 0, 1)
// three 的 `getWorldQuaternion(target)` 会写入传入的 target。
const worldQuaternion = new Quaternion()

function getOnScreen(camera: {
  position: Vector3
  getWorldQuaternion(target: Quaternion): Quaternion
  projectionMatrix?: unknown
}): GridAsset[] | null {
  const results: GridAsset[] = []

  // 1
  // 粗筛：收集相机与目标附近的项
  collectGridItems(camera.position, results)

  // 没有需要处理的内容
  if (results.length === 0) return null

  // 2
  // 朝向与裁剪

  // 获取相机的前向向量
  const output: GridAsset[] = []
  frontVec.set(0, 0, 1).applyQuaternion(camera.getWorldQuaternion(worldQuaternion))

  for (let i = 0; i < results.length; i++) {
    // 顶点过近、过远或在相机背后时跳过
    vertex.copy(results[i].position)

    const cameraToVertex = vertex.sub(camera.position)
    const dist = cameraToVertex.lengthSq()

    if (dist > maxRangeSquare || cameraToVertex.dot(frontVec) > 0) {
      continue
    }

    // 检查顶点投影是否落在屏幕范围内
    vertex.copy(results[i].position)
    const proj = vertex.project(camera as never)

    // 检查项的中心是否在屏幕内（bound = ±25%）
    if (proj.x < -bound || proj.y < -bound || proj.x > bound || proj.y > bound) {
      continue
    }

    // 把到相机的距离记录到资产上
    results[i].cameraDistance = dist
    output.push(results[i])
  }

  // 按到相机的距离排序（最近的在前）
  output.sort(function (a, b) {
    return a.cameraDistance - b.cameraDistance
  })

  // 3 LOD 分箱
  // 填充按 LOD 分组的资产数组

  // 为每个 LOD 创建一个空箱
  const bins: number[] = []
  let max = 0
  descriptors.forEach(function (desc) {
    bins.push(0)
    max += desc.tileCount
  })

  // 在容量允许范围内尽可能多地把资产放入箱中
  const assets: GridAsset[] = []
  let id = 0

  output.forEach(function (asset, i) {
    if (i >= max) return

    if (bins[id] >= descriptors[id].tileCount) {
      id++
    }
    bins[id]++

    asset.lod = id
    assets.push(asset)
  })

  return assets
}
