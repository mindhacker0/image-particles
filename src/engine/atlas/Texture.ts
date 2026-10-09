import type { Texture as ThreeTexture } from 'three'

/** 纹理中单个资源的像素坐标。 */
export interface TextureCoords {
  x: number
  y: number
  w: number
  h: number
  id?: string
}

/**
 * 图集纹理的数据模型：一切均以“像素矩形”为基础。
 */
export class Texture {
  texture: ThreeTexture
  width: number
  height: number
  coords: TextureCoords[]
  lod: number
  assetSize: unknown

  constructor(texture: ThreeTexture, coords: TextureCoords[], assetSize: unknown) {
    texture.generateMipmaps = false

    this.texture = texture
    this.width = (texture.image as { width: number }).width
    this.height = (texture.image as { height: number }).height
    this.coords = coords
    this.lod = -1
    this.assetSize = assetSize
  }

  // 几何体需要能绘制的最大项数，即几何体缓冲的大小
  getNumItemsMax(): number {
    return this.coords.length
  }
}
