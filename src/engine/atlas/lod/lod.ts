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
 *
 * Utility that loads higher resolution images (through the LODMesh class) for
 * the artworks that are nearby (through `getOnScreen` / `collectGridItems`).
 *
 * The original built its public surface with an IIFE writing onto `exports`; the
 * port keeps the same shape as a single `lod` object with module level state.
 */

/** An atlas asset plus the members the LOD grid queries need. */
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
  // the original created this dispatcher inside `init`
  events: new EventDispatcher(),
  minimumLODResolution: 0,
  minRange: 0,
  maxRange: 0,

  init(lodDescriptors, container3D, atlasMeshes, _debug) {
    // creates a set of LODs
    let level = 0
    descriptors = lodDescriptors || [
      new LODDescriptor(level++, 1024, 1024, 200),
      new LODDescriptor(level++, 256, 1024, 200),
      new LODDescriptor(level++, 128, 2048, 2500),
      // new LODDescriptor( level++,   64, 2048, 5000 )
    ]

    if (legacyParams().isBigWallVersion) {
      // TODO bigWall params
    }

    // minimum resolution at which metadata can be displayed
    lod.minimumLODResolution = descriptors[1].tileSize

    // creates LODItems associated to the LOD Descriptors
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

    // transfer object to update the metadata
    const assetsBySize: Record<string, string[]> = {}
    assetsBySize[lods[0].tileSize] = [(tmpAsset as GridAsset).id]

    // dispatch an event to update the metadata
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

  /** Updates the LODItems with the assets visible on screen. */
  setFromCamera() {
    if (legacyCameraControls().tweening) return
    if (busy) return
    busy = true

    // get a list of arrays of items that are currently on screen
    const newItems = getOnScreen(legacyCamera() as never)

    if (newItems == null) {
      busy = false
      return
    }

    // resets the items LODS
    if (currentItems) {
      // resets previous list
      lod.clear()

      newItems.forEach(function (asset) {
        asset.needed = true
        asset.drawn = false
      })

      currentItems = newItems
    } else {
      currentItems = newItems
    }

    // transfer object to update the metadata
    const assetsBySize: Record<string, string[]> = {}

    // updates the LODItems accordingly
    lods.forEach(function (lodItem, id) {
      // call loadings, then mesh & texture updates
      lodItem.update(currentItems as GridAsset[])

      // prepares an object to update the metadata
      const maxRangeForLod = Math.pow(descriptors[id].range, 2)

      assetsBySize[lodItem.tileSize] = (lodItem.assets as GridAsset[])
        .filter(function (asset) {
          return asset.cameraDistance < maxRangeForLod
        })
        .map(function (asset) {
          return asset.id
        })
    })

    // dispatch an event to update the metadata
    lod.events.dispatch('update', { assets: assetsBySize })

    // sets the new URL
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
 * Collects assets in the vicinity of a 3D position.
 *
 * @param position the position to check
 * @param results an array that will contain the nearest assets to the position
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

// collects items that are offscreen by max 25%
const bound = 1.25
const vertex = new Vector3()
const frontVec = new Vector3(0, 0, 1)
// three's `getWorldQuaternion(target)` writes into the target it is given.
const worldQuaternion = new Quaternion()

function getOnScreen(camera: {
  position: Vector3
  getWorldQuaternion(target: Quaternion): Quaternion
  projectionMatrix?: unknown
}): GridAsset[] | null {
  const results: GridAsset[] = []

  // 1
  // broad phase: gathers the items in the vicinity of the camera and the target
  collectGridItems(camera.position, results)

  // nothing to process
  if (results.length === 0) return null

  // 2
  // orientation & clipping

  // retrieve camera's forward vector
  const output: GridAsset[] = []
  frontVec.set(0, 0, 1).applyQuaternion(camera.getWorldQuaternion(worldQuaternion))

  for (let i = 0; i < results.length; i++) {
    // skip if vertex too close, too far or behind the camera
    vertex.copy(results[i].position)

    const cameraToVertex = vertex.sub(camera.position)
    const dist = cameraToVertex.lengthSq()

    if (dist > maxRangeSquare || cameraToVertex.dot(frontVec) > 0) {
      continue
    }

    // check if the vertex projects within the screen frame
    vertex.copy(results[i].position)
    const proj = vertex.project(camera as never)

    // check if item's center is on screen ( bound = +/- 25 % )
    if (proj.x < -bound || proj.y < -bound || proj.x > bound || proj.y > bound) {
      continue
    }

    // stores the distance to camera within the asset
    results[i].cameraDistance = dist
    output.push(results[i])
  }

  // sort on distance to camera (closest first)
  output.sort(function (a, b) {
    return a.cameraDistance - b.cameraDistance
  })

  // 3 LOD binning
  // fills arrays containing assets per LOD

  // creates an empty bin per LOD
  const bins: number[] = []
  let max = 0
  descriptors.forEach(function (desc) {
    bins.push(0)
    max += desc.tileCount
  })

  // stores as many assets as possible in the bins
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
