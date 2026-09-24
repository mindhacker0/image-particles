import { LinearFilter, Texture as ThreeTexture } from 'three'
import type { ImageDescriptor } from './helpers/ImageDescriptor'
import type { LODDescriptor } from './helpers/LODDescriptor'

/**
 *
 * Canvas backed texture for one level of detail: each tile holds the artwork
 * image of an asset, and the canvas is redrawn when the pool changes.
 *
 * The three API used here (`Texture`, `LinearFilter`) is unchanged in modern
 * revisions; the canvas only has to be flagged with `needsUpdate`.
 */

const TILE_COLORS = ['#f00', '#FC0', '#0C3', '#03C']

export class LODTexture {
  desc: LODDescriptor
  lod: number
  tileSize: number
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: ThreeTexture

  constructor(desc: LODDescriptor) {
    this.desc = desc
    this.lod = desc.lod
    this.tileSize = desc.tileSize

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.canvas.height = desc.textureSize
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D

    this.ctx.fillStyle = TILE_COLORS[this.lod % 4]
    this.ctx.fillRect(0, 0, this.desc.textureSize, this.desc.textureSize)

    this.texture = new ThreeTexture(this.canvas)
    this.texture.minFilter = LinearFilter
    this.texture.magFilter = LinearFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
  }

  showCanvasDebug(size: number): void {
    this.canvas.style.position = 'absolute'
    this.canvas.style.bottom = '0'
    this.canvas.style.left = this.lod * size + 'px'
    this.canvas.style.width = size + 'px'
    this.canvas.style.height = size + 'px'
    this.canvas.style.display = 'block'
    document.body.appendChild(this.canvas)
  }

  reset(): void {
    this.ctx.clearRect(0, 0, this.desc.textureSize, this.desc.textureSize)
    this.texture.needsUpdate = true
  }

  rebuildTexture(imageDescriptors: ImageDescriptor[]): void {
    const scope = this
    const tileSize = this.desc.tileSize
    const rowCount = this.desc.rowCount

    this.ctx.clearRect(0, 0, this.desc.textureSize, this.desc.textureSize)

    this.ctx.fillStyle = 'rgba( 0, 0, 0, ' + this.lod / 4 + ')'
    this.ctx.fillRect(0, 0, this.desc.textureSize, this.desc.textureSize)

    imageDescriptors.forEach(function (imd, i) {
      const x = (i % rowCount) * tileSize
      const y = parseInt(String(i / rowCount), 10) * tileSize

      if (imd.img == null) {
        scope.ctx.fillStyle = 'rgba( 0, 0, 0, .5 )'
        scope.ctx.fillRect(x, y, imd.w as number, imd.h as number)

        scope.ctx.strokeStyle = '#FFF'
        scope.ctx.beginPath()
        scope.ctx.moveTo(x, y)
        scope.ctx.lineTo(x + (imd.w as number), y + (imd.h as number))
        scope.ctx.moveTo(x + (imd.w as number), y)
        scope.ctx.lineTo(x, y + (imd.h as number))
        scope.ctx.stroke()
      } else {
        scope.ctx.drawImage(
          imd.img as CanvasImageSource,
          0,
          0,
          imd.w as number,
          imd.h as number,
          x,
          y,
          imd.w as number,
          imd.h as number,
        )
      }
    })

    this.texture.needsUpdate = true
  }
}
