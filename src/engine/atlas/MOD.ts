import { Color } from 'three'
import { EventDispatcher } from '../utils/events'
import type { CanvasTextureLike } from './MODMesh'
import { MODMesh } from './MODMesh'
import { highlight, resetHighlight } from './utils'

/**
 * Ported from `js/atlas/mod.js`.
 *
 * "Mesh On Demand" utility that loads new assets into an atlas. It is dead code
 * in this snapshot (`js/atlas/atlas.js` keeps its instantiation commented out)
 * and it calls a `LODTexture` API of an older revision, which is why the
 * texture calls below are guarded/optional.
 *
 * Two latent bugs of the original are fixed here and marked with a comment:
 *   * `clear()` referenced an undeclared global `mesh` instead of `this.mesh`;
 *   * `removeCanvasDebug()` assigned the undeclared identifier `none` instead of
 *     the string `'none'`.
 */
export class MOD {
  showDebug: boolean
  mesh: MODMesh
  events: EventDispatcher

  constructor(showDebug?: boolean) {
    this.showDebug = Boolean(showDebug)
    this.mesh = new MODMesh({ assetSize: 32, textureSize: 2048 })

    if (this.showDebug) {
      this.showCanvasDebug(this.mesh.texture as unknown as CanvasTextureLike, 0, 256)
    }

    // event dispatcher to alert
    this.events = new EventDispatcher()
  }

  showCanvasDebug(texture: CanvasTextureLike, num: number, size: number): void {
    texture.canvas.style.position = 'absolute'
    texture.canvas.style.bottom = '0'
    texture.canvas.style.right = num * size + 'px'
    texture.canvas.style.width = size + 'px'
    texture.canvas.style.display = 'block'
    document.body.appendChild(texture.canvas)
  }

  removeCanvasDebug(texture: CanvasTextureLike): void {
    // the original assigned the undeclared identifier `none`
    texture.canvas.style.display = 'none'
    document.body.removeChild(texture.canvas)
  }

  clear(): void {
    // the original referenced an undeclared global `mesh`
    ;(this.mesh.texture as unknown as { clear?(): void }).clear?.()
  }

  setFromIds(ids: string[]): void {
    // get items that are currently on screen
    if (this.showDebug) {
      resetHighlight()
      highlight(ids, new Color(0, 1, 0))
    }

    // limit the number of assets to this texture's capability
    const texture = this.mesh.texture as unknown as {
      getNumItemsMax?(): number
      updateList?(list: string[], updated: boolean): void
    }

    const maxAssets = texture.getNumItemsMax?.() ?? ids.length

    if (ids.length > maxAssets) {
      ids.splice(maxAssets - 1, ids.length)
    }

    texture.updateList?.(ids, true)

    // dispatch event if range has at least one item
    // if (ids.length) {
    //   this.events.dispatch('update', {
    //     assets: ids,
    //     size: this.mesh.texture.assetSize
    //   });
    // }
  }
}
