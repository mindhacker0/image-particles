import { Color } from 'three'
import { EventDispatcher } from '../utils/events'
import type { CanvasTextureLike } from './MODMesh'
import { MODMesh } from './MODMesh'
import { highlight, resetHighlight } from './utils'

/**
 * "Mesh On Demand"：按需向图集加载新资产的工具。
 * 目前为死代码（`Atlas` 中未启用），且依赖旧版 `LODTexture` API，
 * 因此下面访问纹理时做了可选链保护。
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

    // 用于通知外部的事件派发器
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
    texture.canvas.style.display = 'none'
    document.body.removeChild(texture.canvas)
  }

  clear(): void {
    ;(this.mesh.texture as unknown as { clear?(): void }).clear?.()
  }

  setFromIds(ids: string[]): void {
    // 获取当前在屏幕上的项
    if (this.showDebug) {
      resetHighlight()
      highlight(ids, new Color(0, 1, 0))
    }

    // 按纹理容量限制资产数量
    const texture = this.mesh.texture as unknown as {
      getNumItemsMax?(): number
      updateList?(list: string[], updated: boolean): void
    }

    const maxAssets = texture.getNumItemsMax?.() ?? ids.length

    if (ids.length > maxAssets) {
      ids.splice(maxAssets - 1, ids.length)
    }

    texture.updateList?.(ids, true)
  }
}
