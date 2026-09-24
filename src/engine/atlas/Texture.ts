import type { Texture as ThreeTexture } from 'three'

export interface TextureCoords {
  x: number
  y: number
  w: number
  h: number
  id?: string
}

/**
 *
 * Texture is the base data model since everything about these atlases is based
 * on 'rectangles of pixels data'.
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

  // returns the number of items max that the geometry must be able to draw
  // ie : it will define the size of the geometry buffer
  getNumItemsMax(): number {
    return this.coords.length
  }
}
