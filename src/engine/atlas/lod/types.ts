/**
 * LOD 辅助模块所看到的最小图集资源形态。
 *
 * 完整的 `Asset` 类位于 `../Asset.ts`；池只需用到这几个成员，
 * 因此与它保持解耦。
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
