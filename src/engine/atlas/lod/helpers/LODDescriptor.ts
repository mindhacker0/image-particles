/**
 * 保存某一细节层级的配置信息。
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

    // 记录该 LOD 的容量
    this.rowCount = parseInt(String(this.textureSize / this.tileSize), 10)
    this.tileCount = parseInt(String(Math.pow(this.rowCount, 2)), 10)
  }

  /** 返回该 LOD 可用的最大图块数。 */
  getTileCount(): number {
    return parseInt(String(Math.pow(this.textureSize / this.tileSize, 2)), 10)
  }
}
