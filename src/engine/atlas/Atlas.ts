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
 * 图集管理器：负责静态纹理切片、LOD、元数据标签和资产索引。
 */

/** 预渲染图集的基础路径。 */
export const STATIC_API = 'data'

/** 保留的计数器。 */
export let count = 0

export const textureLoader = new TextureLoader()

/** 从 `.bin` 坐标文件中解码出的单个图块矩形。 */
export interface AtlasCoords {
  id: string
  /** 填充字节，未使用。 */
  a: number
  x: number
  y: number
  w: number
  h: number
}

/** `loadStatic` 返回的内容：纹理、坐标和基础尺寸。 */
export type AtlasStaticData = [ThreeTexture, AtlasCoords[], number]

/** Atlas 构造参数。 */
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
 * `loadAllStatics` 构造、传递给 `loadNextStatic` 的参数。
 */
export interface StaticAtlasParams {
  assetSize?: number
  atlasSize?: number
  numAtlasMax?: number
  maxAssetPerAtlas?: number | null
  /** 无效字段：仅写入、从不读取（见 `loadAllStatics`）。 */
  coordsPath?: string
  onComplete?: () => void
  onProgress?: (pct: number) => void
}

/** 图集中的网格类型：静态 `Mesh` 或 `LODMesh`。 */
export type AtlasMesh = Mesh | LODMesh

export class Atlas {
  opts: AtlasOptions
  container: Group
  jsonLoader: JSONLoader
  // 当前图集中的所有资产
  assets: Asset[]
  // 每个资产对应的网格实例
  meshes: AtlasMesh[]
  // 按 asset id 索引的网格数组
  meshesPerAssetId: Record<string, Mesh[]>

  lod: typeof lod
  mdLabels: LODMetadatas

  fogDistance: number
  mouse: Vector3
  raycaster: Raycaster

  // 在时间线初始化后由 `dateLabels` 填充
  datesMaterial: ShaderMaterial | null

  constructor(opts?: AtlasOptions) {
    this.opts = opts || {}
    this.container = new Group()
    this.jsonLoader = new JSONLoader()
    this.assets = []
    this.meshes = []
    this.meshesPerAssetId = {}

    // LOD（细节层次）为靠近相机的资产加载更高分辨率的纹理
    this.lod = lod
    lod.init(null, this.container, this.meshes, this.opts.showDebug)

    // 元数据自动标签
    this.mdLabels = new LODMetadatas(lod)
    this.container.add(this.mdLabels.container)

    this.fogDistance = 50000
    this.mouse = new Vector3()
    this.raycaster = new Raycaster()

    // 时间线初始化时补充
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
      // 这些标签是附加了 `click` 方法的 `MetadataLabel` 网格
      const sprites = this.mdLabels.container.children as MetadataLabel[]

      let delta = 0
      const app = freefallApp()
      if (app.editorPanel && app.editorPanel.opened) {
        delta = app.editorPanel.getWidth()
      }

      this.mouse.x = ((mousex - delta) / rendererWidth()) * 2 - 1
      this.mouse.y = -(mousey / rendererHeight()) * 2 + 1

      // `mouse` 保持为 Vector3：raycaster 只会读取其中的 x / y
      this.raycaster.setFromCamera(
        this.mouse as unknown as Vector2,
        legacyCamera() as unknown as PerspectiveCamera,
      )

      const intersects = this.raycaster.intersectObjects<MetadataLabel>(sprites)

      if (intersects.length) {
        let asset: MetadataAsset | true | null = null
        for (let i = 0; i < intersects.length; i++) {
          asset = this.hitLabel(intersects, i, click)
          if (asset) return asset == true ? null : asset
        }
        // 循环结束后 `asset` 必然为假值（命中为真会立即返回），故直接返回 null
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
    const app = freefallApp()
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
    // 未使用预渲染图集
    if (opts.numAtlasMax == 0) {
      if (onComplete) onComplete()
      return
    }
    // 将选项整理为带默认值的参数对象，并附加进度 / 完成回调
    const params: StaticAtlasParams = {}
    params.assetSize = opts.assetSize || 16
    params.atlasSize = opts.atlasSize || params.assetSize * 128
    params.numAtlasMax = opts.numAtlasMax || 10
    params.maxAssetPerAtlas = opts.maxAssetPerAtlas || null
    // 设置单张纹理的资产上限
    if (params.maxAssetPerAtlas) {
      // 保留的历史问题：`params.coordsPath` 从未从 `opts` 复制，且 `loadNextStatic`
      // 会重建自己的路径，因此这次拼接是死代码（上限从未生效）。
      params.coordsPath = String(params.coordsPath) + '&limit=' + params.maxAssetPerAtlas
    }
    // 记录回调
    params.onComplete = onComplete
    params.onProgress = onProgress
    // 启动加载队列
    this.loadNextStatic(0, params)
  }

  loadNextStatic(numLoaded: number, opts: StaticAtlasParams): void {
    // 推导纹理与坐标文件路径
    const texturePath = STATIC_API + '/atlas' + numLoaded + '.jpg'
    const coordsPath = STATIC_API + '/atlas' + numLoaded + '.bin'
    const loader = this.loadStatic(texturePath, coordsPath, opts.assetSize)
    // 启动加载并处理 promise 结果
    loader.then((args) => {
      // 处理已加载的数据
      this.onStaticAtlasLoaded.apply(this, args)
      // 更新进度
      numLoaded++
      if (opts.onProgress) {
        opts.onProgress(numLoaded / opts.numAtlasMax)
      }
      // 队列完成时调用完成回调
      if (numLoaded == opts.numAtlasMax) {
        if (opts.onComplete) {
          opts.onComplete()
        }
      }
      // 否则继续加载下一项
      else {
        this.loadNextStatic(numLoaded, opts)
      }
    })
  }

  // 通过 texturePath 与 coordsPath 加载静态（预渲染）图集
  // assetSize 定义该纹理中每个资产的基础尺寸
  loadStatic(texturePath: string, coordsPath: string, assetSize: number): Promise<AtlasStaticData> {
    const promise = new Promise<AtlasStaticData>((resolve) => {
      // 加载纹理
      const texture = textureLoader.load(texturePath, () => {
        // 加载坐标
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
      const BYTES_PER_LINE = 21 // 记录布局：14 字节 id + 1 字节填充 + 2 个 ushort + 2 个 byte
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
          // 将 14 个字节解析为 id 字符串
          id: String.fromCharCode.apply(null, Array.from(miduint8)),
          a: dv.getUint8(off + 14),
          x: dv.getUint16(off + 15, true) / 4,
          y: dv.getUint16(off + 17, true) / 4,
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
    // 创建网格
    const atlasTexture = new Texture(texture, datas, assetSize)
    const mesh = new Mesh(atlasTexture)
    this.addMesh(mesh)
  }

  addMesh(mesh: Mesh): void {
    this.container.add(mesh.mesh)
    this.meshes.push(mesh)

    // 注意：下面的遍历开销随资产数增长，可能较慢；
    // 由于 LOD 初始化时 assets 字典为空，这里对 LOD / MOD 没有影响
    const assetIds = Object.keys(mesh.assets)
    let assetId
    for (let i = 0, l = assetIds.length; i < l; i++) {
      assetId = assetIds[i]
      this.addAsset(assetId, mesh)
    }

    // 标记需要渲染
    markRenderNeeded()
  }

  addAsset(assetId: string, mesh: Mesh): void {
    const meshesPerAssetId = this.meshesPerAssetId
    const assets = this.assets
    // 补充 Model.items 中缺失的条目
    if (!Model.items[assetId]) {
      Model.items[assetId] = {}
    }
    // 更新按 assetId 索引的网格列表
    meshesPerAssetId[assetId] = meshesPerAssetId[assetId] || []
    meshesPerAssetId[assetId].push(mesh)
    // 收集资产
    assets.push(mesh.assets[assetId])
  }

  // 返回该资产所在的所有网格
  getAssetMeshes(id: string): Mesh[] {
    return this.meshesPerAssetId[id]
  }

  getAsset(id: string): Asset | null {
    const mesh = this.meshesPerAssetId[id]
    if (mesh) {
      // 返回分辨率最低的资产实例
      return mesh[0].assets[id]
    }
    return null
  }

  /** 返回用于片头动画的代表资产。 */
  getOldestAsset(): Asset | null {
    return this.getAsset('PgFQ5eYVxWNuJA') || this.assets[2]
  }

  // 根据 assetId 数组返回资产数组
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
      // 只有静态网格拥有 `transitionPct`，在 LOD 网格上写入同样无害
      ;(mesh as Mesh).transitionPct = 1
      mesh.update()
    }
  }

  getTransitionPct(): number {
    let sum = 0
    this.meshes.forEach(function (mesh) {
      if (mesh.type != 'mesh') return
      sum = Math.max(sum, (mesh as Mesh).transitionPct)
    })
    return sum
  }

  update(): void {
    for (const mesh of this.meshes) {
      mesh.update()
    }
    this.mdLabels.update()
    if (legacyAtlas().datesMaterial) {
      dateLabels.update()
    }
  }

  setFogColor(value: unknown): void {
    // 暂时禁用：直接返回
    return
    // 粒子雾色
    for (const mesh of this.meshes) {
      mesh.material.material.uniforms.fogColor.value = value
    }
    // 日期标签的雾色
    if (legacyAtlas().datesMaterial) {
      legacyAtlas().datesMaterial.uniforms.fogColor.value = value
    }
  }

  setFogDistance(value: number, duration?: number): void {
    // 暂时禁用：直接返回
    return
    duration = duration || 1

    // 粒子雾
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

    // 日期标签的雾
    if (legacyAtlas().datesMaterial) {
      gsap.to(legacyAtlas().datesMaterial.uniforms.fogDistance, { duration, value: value })
    }
  }
}

/* ------------------------------------------------------------------------- *
 * 延迟读取的共享状态访问器：这些值在本模块被求值时还不存在，
 * 因此只在调用时通过下面的函数读取。
 * ------------------------------------------------------------------------- */

/** 渲染器宽度。 */
function rendererWidth(): number {
  return shared.rendererWidth
}

/** 渲染器高度。 */
function rendererHeight(): number {
  return shared.rendererHeight
}

/** 本模块用到的 `app` 字段。 */
interface FreefallApp {
  /** 当前不会被赋值，但外部仍会读取。 */
  editorPanel?: { opened: boolean; width: number; getWidth(): number } | null
  sideContent: {
    
  }
}

/** `app` 实例（补充了上面用到的字段）。 */
function freefallApp(): FreefallApp | undefined {
  return legacyApp() as unknown as FreefallApp | undefined
}

/** 图集单例，即本类自身。 */
function legacyAtlas(): Atlas {
  return atlasInstance() as unknown as Atlas
}
