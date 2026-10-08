import {
  Group,
  Raycaster,
  TextureLoader,
  Vector3,
  type Intersection,
  type PerspectiveCamera,
  type ShaderMaterial,
  type Texture as ThreeTexture,
  type Vector2,
} from 'three'
import { gsap } from 'gsap'
import { Model } from '../data/Models'
import { shared } from '../Main'
import { atlasInstance, legacyApp, legacyCamera, markRenderNeeded } from '../legacyScope'
import { JSONLoader } from '../utils/JSONLoader'
import { dateLabels } from './DateLabels'
import { lod } from './lod/lod'
import { LODMesh } from './lod/LODMesh'
import { LODMetadatas, type MetadataAsset, type MetadataLabel } from './Metadatas'
import { Mesh } from './Mesh'
import { Texture } from './Texture'
import type { Asset } from './Asset'

/**
 *
 * The atlas owns the static (pre-rendered) texture tiles, the LOD orchestrator,
 * the metadata labels and the asset lookup dictionaries every formula goes
 * through (`getAsset`, `getAssetsFromIds`, `getOldestAsset`).
 *
 * Notes on the non-obvious parts:
 * - Everything the original reached for through a global is now an import
 *   (`lod`, `LODMetadatas`, `Texture`, `Mesh`, `JSONLoader`, `Model`, `gsap`,
 *   `dateLabels`). The module only reads the `atlas` global itself for
 *   `datesMaterial` (assigned by `js/atlas/dateLabels.js`) plus the render loop
 *   globals owned by `js/main.js` (`rendererWidth`, `rendererHeight`) and `app`.
 * - `this.meshes` is handed to `lod.init`, which appends one `LODMesh` per level
 *   of detail, so the array holds the static `Mesh` tiles *and* the `LODMesh`
 *   tiles: it is typed `AtlasMesh[]` and narrowed where a static-tile-only member
 *   (`transitionPct`) is used. `getTransitionPct` skips them through their `type`.
 * - `loadCoords` decodes a fixed 21 byte record per asset:
 *   `char[14] id, byte a, ushort x, ushort y, byte w, byte h` in little endian.
 * - `count`, `jsonLoader`, `fogDistance`, the `mouse`/`raycaster` label picking
 *   and the whole `setFogColor`/`setFogDistance` pair are legacy leftovers: they
 *   are kept with their original names and behaviour even though this snapshot
 *   no longer uses most of them (`setFogColor` / `setFogDistance` are disabled by
 *   the early `return` the original left in).
 */

/** Base url of the pre-rendered atlases (was a Google storage bucket). */
export const STATIC_API = 'data'

/** Legacy counter, only ever read by the commented out `console.log` below. */
export let count = 0

export const textureLoader = new TextureLoader()

/** One rectangle of pixels of an atlas, as decoded from the `.bin` coords file. */
export interface AtlasCoords {
  id: string
  /** padding byte, never used */
  a: number
  x: number
  y: number
  w: number
  h: number
}

/** What `loadStatic` resolves with: the texture, its coords and the base asset size. */
export type AtlasStaticData = [ThreeTexture, AtlasCoords[], number]

/** Options of the `Atlas` constructor (`js/main.js` `params`). */
export interface AtlasOptions {
  showDebug?: boolean
  assetSize?: number
  atlasSize?: number
  numAtlasMax?: number
  maxAssetPerAtlas?: number | null
  coordsPath?: string
  [key: string]: unknown
}

/**
 * The params object `loadAllStatics` builds out of its options and hands to
 * `loadNextStatic` (defaults filled in, progress/complete callbacks attached).
 */
export interface StaticAtlasParams {
  assetSize?: number
  atlasSize?: number
  numAtlasMax?: number
  maxAssetPerAtlas?: number | null
  /** dead legacy field: written but never read back (see `loadAllStatics`) */
  coordsPath?: string
  onComplete?: () => void
  onProgress?: (pct: number) => void
}

/**
 * A tile mesh of the atlas: a static `Mesh` tile or one of the `LODMesh` tiles
 * `lod.init` appends to `atlas.meshes`.
 */
export type AtlasMesh = Mesh | LODMesh

export class Atlas {
  opts: AtlasOptions
  container: Group
  jsonLoader: JSONLoader
  // array with all the assets currently available in the atlas
  assets: Asset[]
  // array with all the assets' meshes
  meshes: AtlasMesh[]
  // dictionary to retrieve the current mesh list of a specific asset id
  meshesPerAssetId: Record<string, Mesh[]>

  lod: typeof lod
  mdLabels: LODMetadatas

  fogDistance: number
  mouse: Vector3
  raycaster: Raycaster

  //set from : js/atlas/dateLabels.js init() method when a timeline is created
  datesMaterial: ShaderMaterial | null

  constructor(opts?: AtlasOptions) {
    this.opts = opts || {}
    this.container = new Group()
    this.jsonLoader = new JSONLoader()
    // array with all the assets currently available in the atlas
    this.assets = []
    // array with all the assets' meshes
    this.meshes = []
    // dictionary to retrieve the current mesh list of a specific asset id
    this.meshesPerAssetId = {}

    // level of detail loads higher resolution textures
    // for the assets that are close to the camera
    // this.lod = new LOD( null, opts.showDebug);
    // for (var lodDesc of this.lod.lods) {
    //     this.addMesh(lodDesc.mesh);
    // }

    //new version
    this.lod = lod
    lod.init(null, this.container, this.meshes, this.opts.showDebug)

    // mesh on demand - loads new images in atlas
    // this.mod = new MOD();
    // this.addMesh(this.mod.mesh);
    // metadatas automatic labels
    this.mdLabels = new LODMetadatas(lod)
    this.container.add(this.mdLabels.container)

    this.fogDistance = 50000
    this.mouse = new Vector3()
    this.raycaster = new Raycaster()

    //set from : js/atlas/dateLabels.js init() method when a timeline is created
    this.datesMaterial = null
  }

  testClickRaycastLabels(event: { clientX: number; clientY: number }): MetadataAsset | null {
    return this.raycastMetadata(event.clientX, event.clientY, false)
  }

  clickRaycastLabels(event: { center?: { x: number; y: number } | null }): MetadataAsset | null {
    if (event.center == null) return null
    else return this.raycastMetadata(event.center.x, event.center.y, true)
  }

  raycastMetadata(mousex: number, mousey: number, click: boolean): MetadataAsset | null {
    if (this.mdLabels.container.children.length) {
      // the labels are `MetadataLabel` meshes patched with a `click` method
      const sprites = this.mdLabels.container.children as MetadataLabel[]

      let delta = 0
      const app = freefallApp()
      if (app.editorPanel && app.editorPanel.opened) {
        delta = app.editorPanel.getWidth()
      }

      this.mouse.x = ((mousex - delta) / rendererWidth()) * 2 - 1
      this.mouse.y = -(mousey / rendererHeight()) * 2 + 1

      // `mouse` stays a Vector3 like in the original: the raycaster only reads x/y
      this.raycaster.setFromCamera(
        this.mouse as unknown as Vector2,
        legacyCamera() as unknown as PerspectiveCamera,
      )

      const intersects = this.raycaster.intersectObjects<MetadataLabel>(sprites)

      if (intersects.length) {
        // the original hoisted this `var` out of the loop and returned it below
        let asset: MetadataAsset | true | null = null
        for (let i = 0; i < intersects.length; i++) {
          asset = this.hitLabel(intersects, i, click)
          if (asset) return asset == true ? null : asset
        }
        // after the loop `asset` is always falsy (a truthy hit returns right
        // away), so `null` is returned instead of the raw (falsy) value
        return null
      }
    }
    return null
  }

  hitLabel(
    intersects: Array<Intersection<MetadataLabel>>,
    i: number,
    click: boolean,
  ): MetadataAsset | true | null {
    const hit = intersects[i].object.click(intersects[i].point)
    const dist = intersects[i].distance
    // legacy reads the `app` global in the two branches below
    const app = freefallApp()
    /*if (hit && hit.type == "out")
        return false;
    else*/
    if (hit && dist > 70) {
      if (!click) return true
      else return hit.asset
    } else if (hit && hit.type == 'external') {
      if (click) {
        window.open(hit.url, '_blank')
      }
      return hit.asset
    } else if (!click) {
      return true
    } else if (hit) {
      return hit.asset
    } else {
      return true
    }
  }

  loadAllStatics(
    opts: AtlasOptions,
    onComplete?: () => void,
    onProgress?: (pct: number) => void,
  ): void {
    // no pre-rendered atlas is being used
    if (opts.numAtlasMax == 0) {
      // FIX: the original called an undeclared `callback` here (the only
      // callback in scope is `onComplete`), which threw a ReferenceError.
      if (onComplete) onComplete()
      return
    }
    // retrieve options into a new params object that has default values
    // and extras informations like progress/complete callbacks
    const params: StaticAtlasParams = {}
    params.assetSize = opts.assetSize || 16
    params.atlasSize = opts.atlasSize || params.assetSize * 128
    params.numAtlasMax = opts.numAtlasMax || 10
    params.maxAssetPerAtlas = opts.maxAssetPerAtlas || null
    // infer folder url
    // params.folder = 'atlas_' + params.assetSize + '_' + params.atlasSize + '_artproject';
    // add per-texture limits
    if (params.maxAssetPerAtlas) {
      // NOTE: latent bug kept as-is - `params.coordsPath` is never copied from
      // `opts` and `loadNextStatic` rebuilds its own paths, so this
      // concatenation is dead code (the limit is never applied). `String()`
      // reproduces the original's "undefined&limit=N".
      params.coordsPath = String(params.coordsPath) + '&limit=' + params.maxAssetPerAtlas
    }
    // add callbacks
    params.onComplete = onComplete
    params.onProgress = onProgress
    // start queue
    this.loadNextStatic(0, params)
  }

  loadNextStatic(numLoaded: number, opts: StaticAtlasParams): void {
    // infer textures & coords paths
    const texturePath = STATIC_API + '/atlas' + numLoaded + '.jpg'
    const coordsPath = STATIC_API + '/atlas' + numLoaded + '.bin'
    // var coordsPath = STATIC_API + '/data/coords/atlas_' + numLoaded + '.json';
    const loader = this.loadStatic(texturePath, coordsPath, opts.assetSize)
    // launch & handle promise's updates (the original used `.bind(this)`)
    loader.then((args) => {
      // process loaded data
      this.onStaticAtlasLoaded.apply(this, args)
      // mark progress
      numLoaded++
      if (opts.onProgress) {
        opts.onProgress(numLoaded / opts.numAtlasMax)
      }
      // call onComplete callback if queue is complete
      if (numLoaded == opts.numAtlasMax) {
        if (opts.onComplete) {
          opts.onComplete()
        }
      }
      // otherwise start loading next item
      else {
        this.loadNextStatic(numLoaded, opts)
      }
    })
  }

  // add static (pre-rendered) atlas map by providing a texturePath and a coordsPath
  // assetSize defines the base size of each asset in this texture
  loadStatic(texturePath: string, coordsPath: string, assetSize: number): Promise<AtlasStaticData> {
    const promise = new Promise<AtlasStaticData>((resolve) => {
      // load texture
      const texture = textureLoader.load(texturePath, () => {
        // load coords
        this.loadCoords(coordsPath, (data) => {
          resolve([texture, data, assetSize])
        })
      })
    })
    return promise
  }

  loadCoords(path: string, callback: (data: AtlasCoords[]) => void): void {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', path, true)
    xhr.responseType = 'arraybuffer'
    xhr.onload = () => {
      const arrayBuffer = xhr.response as ArrayBuffer
      const dv = new DataView(arrayBuffer)
      const MID_LENGTH = 14
      const BYTES_PER_LINE = 21 // byte[MID_LENGTH],byte,ushort,ushort,char,char
      let off = 0
      const data: AtlasCoords[] = []
      const midbuffer = new ArrayBuffer(MID_LENGTH)
      const miduint8 = new Uint8Array(midbuffer)
      let i
      while (off < arrayBuffer.byteLength) {
        for (i = 0; i < MID_LENGTH; i++) {
          miduint8[i] = dv.getUint8(off + i)
        }
        data.push({
          // the original passed the Uint8Array straight to `fromCharCode.apply`:
          // `Array.from` keeps the very same characters
          id: String.fromCharCode.apply(null, Array.from(miduint8)),
          a: dv.getUint8(off + 14),
          x: dv.getUint16(off + 15, true) / 4,
          y: dv.getUint16(off + 17, true) / 4,
          // FIX: the original passed a second `true` (little endian) argument to
          // `getUint8`, which that method ignores; dropped here.
          w: dv.getUint8(off + 19) / 4,
          h: dv.getUint8(off + 20) / 4,
        })
        off += BYTES_PER_LINE
      }
      callback(data)
    }
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
    xhr.send(null)
  }

  onStaticAtlasLoaded(texture: ThreeTexture, datas: AtlasCoords[], assetSize: number): void {
    // create mesh
    // console.log( "mesh load", count++ )
    // console.log(datas, assetSize)
    // NOTE: the original shadowed its `texture` argument with the `Texture` wrapper
    const atlasTexture = new Texture(texture, datas, assetSize)
    const mesh = new Mesh(atlasTexture)
    this.addMesh(mesh)
  }

  addMesh(mesh: Mesh): void {
    this.container.add(mesh.mesh)
    this.meshes.push(mesh)

    // TODO (@cdiagne): measure exec time of this - likely slow
    // code below should have no impact on LOD / MOD since the init lod.assets
    // dictionary is empty
    const assetIds = Object.keys(mesh.assets)
    let assetId
    for (let i = 0, l = assetIds.length; i < l; i++) {
      assetId = assetIds[i]
      this.addAsset(assetId, mesh)
    }

    // turn on render flag
    markRenderNeeded()
  }

  addAsset(assetId: string, mesh: Mesh): void {
    const meshesPerAssetId = this.meshesPerAssetId
    const assets = this.assets
    // update global Model dict
    if (!Model.items[assetId]) {
      Model.items[assetId] = {}
    }
    // update the meshes per assetId dictionary index
    meshesPerAssetId[assetId] = meshesPerAssetId[assetId] || []
    meshesPerAssetId[assetId].push(mesh)
    // push asset to array
    assets.push(mesh.assets[assetId])
  }

  // returns an arraw of meshes where this asset is available
  getAssetMeshes(id: string): Mesh[] {
    return this.meshesPerAssetId[id]
  }

  getAsset(id: string): Asset | null {
    const mesh = this.meshesPerAssetId[id]
    if (mesh) {
      // return asset taken from lowest available resolution
      return mesh[0].assets[id]
    }
    return null
  }

  getOldestAsset(): Asset | null {
    return this.getAsset('PgFQ5eYVxWNuJA') || this.assets[2]
  }

  // returns an array of assets from an array of assetIds
  getAssetsFromIds(ids: string[]): Asset[] {
    const result: Asset[] = []
    let asset
    for (let i = 0, l = ids.length; i < l; i++) {
      asset = this.getAsset(ids[i])
      if (asset) {
        result.push(asset)
      }
    }
    return result
  }

  getAssetsFromIdsDict(idsDict: Record<string, unknown>): Asset[] {
    return this.getAssetsFromIds(Object.keys(idsDict))
  }

  skipAnimation(): void {
    this.update()
    for (const mesh of this.meshes) {
      // only the static tiles own a `transitionPct`: writing it on the LOD tiles
      // was harmless in the original as well
      ;(mesh as Mesh).transitionPct = 1
      mesh.update()
    }
  }

  getTransitionPct(): number {
    let sum = 0
    // var str = '';
    this.meshes.forEach(function (mesh) {
      if (mesh.type != 'mesh') return
      sum = Math.max(sum, (mesh as Mesh).transitionPct)
      // str += mesh.transitionPct + ', ';
    })
    // console.log( str, sum );
    return sum
  }

  update(): void {
    // console.time('atlas.update');
    for (const mesh of this.meshes) {
      mesh.update()
    }
    this.mdLabels.update()
    // the original read the global `atlas` here
    if (legacyAtlas().datesMaterial) {
      dateLabels.update()
    }
    // console.timeEnd('atlas.update');
  }

  setFogColor(value: unknown): void {
    return
    // particles fog color
    for (const mesh of this.meshes) {
      mesh.material.material.uniforms.fogColor.value = value
    }
    //dates' labels fog color
    if (legacyAtlas().datesMaterial) {
      legacyAtlas().datesMaterial.uniforms.fogColor.value = value
    }
  }

  setFogDistance(value: number, duration?: number): void {
    return
    duration = duration || 1

    // particles fog
    if (duration == 0) {
      for (const mesh of this.meshes) {
        mesh.material.material.uniforms.fogDistance.value = value
      }
    } else {
      for (const mesh of this.meshes) {
        gsap.to(mesh.material.material.uniforms.fogDistance, {
          duration,
          value: value,
          onUpdate: function () {
            markRenderNeeded()
          },
        })
      }
    }

    //dates' labels fog
    if (legacyAtlas().datesMaterial) {
      gsap.to(legacyAtlas().datesMaterial.uniforms.fogDistance, { duration, value: value })
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Legacy globals still owned by the classic scripts.
 * They are read at call time: they do not exist yet while this module is
 * evaluated / imported.
 * ------------------------------------------------------------------------- */

/** `rendererWidth` (set by `Main.initTHREE`). */
function rendererWidth(): number {
  return shared.rendererWidth
}

/** `rendererHeight` (set by `Main.initTHREE`). */
function rendererHeight(): number {
  return shared.rendererHeight
}

/** The members of `app` (`js/apps/app_freefall.js`) this module reads. */
interface FreefallApp {
  /** never assigned in this snapshot, but read by `js/main.js` too */
  editorPanel?: { opened: boolean; width: number; getWidth(): number } | null
  sideContent: {
    
  }
}

/** `app` (`js/apps/app_freefall.js`), extended with the members used above. */
function freefallApp(): FreefallApp | undefined {
  return legacyApp() as unknown as FreefallApp | undefined
}

/** `atlas` (`js/atlas/atlas.js`): this very class, published as a global. */
function legacyAtlas(): Atlas {
  return atlasInstance() as unknown as Atlas
}
