/**
 * Minimal shape of an atlas asset as the LOD helpers see it.
 *
 * The full `Asset` class lives in `../Asset.ts`; the pools only need these few
 * members, so they stay decoupled from it.
 */
export interface LODAssetLike {
  id: string
  image_url: string | null
  valid: boolean
  drawn: boolean
  needed?: boolean
  lod?: number
  coords?: { x: number; y: number; w: number; h: number; id?: string }
}
