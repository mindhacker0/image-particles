/**
 * Stores the information about one level of detail.
 */
export class LODDescriptor {
  lod: number
  tileSize: number
  textureSize: number
  range: number
  rowCount: number
  tileCount: number

  constructor(lod: number, tileSize: number, textureSize: number, range: number) {
    this.lod = lod
    this.tileSize = tileSize
    this.textureSize = textureSize
    this.range = range

    // stores the capacity of this LOD
    this.rowCount = parseInt(String(this.textureSize / this.tileSize), 10)
    this.tileCount = parseInt(String(Math.pow(this.rowCount, 2)), 10)
  }

  /** Returns the maximum number of tiles available on this LOD. */
  getTileCount(): number {
    return parseInt(String(Math.pow(this.textureSize / this.tileSize, 2)), 10)
  }
}
