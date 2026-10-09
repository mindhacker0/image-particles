import { atlasInstance } from '../legacyScope'
import { Asset } from './Asset'
import { Mesh } from './Mesh'
import { LODTexture } from './lod/LODTexture'
import type { LODDescriptor } from './lod/helpers/LODDescriptor'
import type { Texture } from './Texture'

type LODTextureOptions = ConstructorParameters<typeof LODTexture>[0]

/** 旧版 MOD 代码所依赖的、基于 canvas 的 `LODTexture` 接口。 */
export interface CanvasTextureLike {
  canvas: HTMLCanvasElement
}

/**
 * 旧版 `LODTexture` 的接口，MOD 代码按它编写；
 * 当前纹理可能缺少这些成员，因此均声明为可选。
 */

interface ModTexture {
  events?: { addListener(label: string, callback: (event: ModAssetEvent) => void, once?: boolean): void }
  assetSize?: number
  getNumItemsMax?(): number
  updateList?(ids: string[], updated: boolean): void
  clear?(): void
}

export interface ModAssetEvent {
  assetId: string
  coords: { x: number; y: number; w: number; h: number; id?: string }
}

/** 按需加载网格：把动态加载的资源追加到几何体与资源列表中。 */
export class MODMesh extends Mesh {
  // 记录各资源在 LOD 纹理中的坐标
  assetsCoords: Record<string, ModAssetEvent['coords']> = {}

  onAssetInCallback: ((asset: Asset) => void) | null = null

  private readonly assetInHandler: (event: ModAssetEvent) => void
  private readonly assetOutHandler: (event: ModAssetEvent) => void

  constructor(opts: Partial<LODTextureOptions> & Record<string, unknown>) {
    const texture = new LODTexture(opts as unknown as LODTextureOptions)

    super(texture as unknown as Texture)

    this.assetInHandler = this.onAssetIn.bind(this)
    this.assetOutHandler = this.onAssetOut.bind(this)

    const modTexture = texture as unknown as ModTexture
    modTexture.events?.addListener('asset_in', this.assetInHandler, false)
    modTexture.events?.addListener('asset_out', this.assetOutHandler, false)
  }

  onAssetIn(event: ModAssetEvent): void {
    const asset = new Asset({
      id: event.assetId,
      coords: event.coords,
    })

    this.geometry.append(asset, event.coords)
    this.assetsCoords[asset.id] = event.coords

    // 加入本网格的资源列表
    this.assets[asset.id] = asset

    atlasInstance().addAsset(asset.id, this)

    if (this.onAssetInCallback) {
      this.onAssetInCallback(asset)
    }
  }

  onAssetOut(): void {
    // 暂无需处理
  }
}
