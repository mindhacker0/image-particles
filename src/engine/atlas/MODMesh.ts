import { atlasInstance } from '../legacyScope'
import { Asset } from './Asset'
import { Mesh } from './Mesh'
import { LODTexture } from './lod/LODTexture'
import type { LODDescriptor } from './lod/helpers/LODDescriptor'
import type { Texture } from './Texture'

type LODTextureOptions = ConstructorParameters<typeof LODTexture>[0]

/**
 * The canvas backed `LODTexture` API the (dead) MOD code was written against.
 */
export interface CanvasTextureLike {
  canvas: HTMLCanvasElement
}

/**
 * Ported from `js/atlas/mod_mesh.js` ("Mesh On Demand").
 *
 * NOTE: this module is dead code in this snapshot — `js/atlas/atlas.js` has its
 * single instantiation commented out — and it calls a `LODTexture` API from an
 * older revision (`texture.events`, `texture.assetSize`). It is ported as-is so
 * the `MODMesh` / `MOD` globals keep existing, and the texture access is kept
 * behind a structural type for the same reason.
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

export class MODMesh extends Mesh {
  // dictionary that keeps a record of an asset coordinates in the LOD texture
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

    // append to this asset list
    this.assets[asset.id] = asset

    atlasInstance().addAsset(asset.id, this)

    if (this.onAssetInCallback) {
      this.onAssetInCallback(asset)
    }
  }

  onAssetOut(): void {
    // nothing to do yet (kept from the original)
  }
}
