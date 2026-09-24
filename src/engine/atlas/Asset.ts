import { Color, Vector3 } from 'three'
import type { FormulaAsset } from '../legacyScope'
import { map } from '../utils/math'

//min XYZ, max XYZ, block count ( 100 * 100 * 100 ), squared block count
export const S = 1000

// The legacy code passed a fourth argument (the squared block count) which
// Vector3 ignores, so it is dropped here.
export const gridSize = new Vector3(-10000, 10000, S)

let uidColor = 1

export interface AssetCoords {
  x: number
  y: number
  w: number
  h: number
  id?: string
}

export interface AssetOptions {
  id: string
  coords: AssetCoords
}

interface AssetMesh {
  geometry: {
    show(asset: Asset): void
    hide(asset: Asset): void
  }
}

export class Asset implements FormulaAsset {
  readonly _uid: number
  readonly id: string
  readonly coords: AssetCoords
  readonly sizeNorm: { w: number; h: number }

  mesh: AssetMesh | undefined
  positionInbuffer = -1

  // LOD
  lod = -1
  cameraDistance = 0
  image_url: string | null = null
  valid = true
  needed = false
  drawn = false

  grid = new Vector3()
  updateFlags: Record<string, boolean> = {}
  log: unknown[] = []

  private readonly _position = new Vector3()
  private readonly _color = new Color(1, 1, 1)
  private _tween = 1

  constructor(opts: AssetOptions) {
    this._uid = uidColor++
    this.id = opts.id
    this.coords = opts.coords

    const size = Math.max(this.coords.w, this.coords.h)
    this.sizeNorm = {
      w: (this.coords.w / size) * 16,
      h: (this.coords.h / size) * 16,
    }
  }

  get position(): Vector3 {
    return this._position
  }

  set position(val: Vector3) {
    this._position.copy(val)
    this.grid.x = parseInt(String(map(val.x, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
    this.grid.y = parseInt(String(map(val.y, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
    this.grid.z = parseInt(String(map(val.z, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
    this.updateFlags.position = true
  }

  get color(): Color {
    return this._color
  }

  set color(val: Color) {
    this.setColor(val.r, val.g, val.b)
  }

  get tween(): number {
    return this._tween
  }

  set tween(val: number) {
    this._tween = val
    this.updateFlags.tween = true
  }

  get uid(): number {
    return this._uid
  }

  setPosition(x: number, y: number, z: number): void {
    this._position.set(x, y, z)

    this.grid.x = parseInt(String(map(x, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
    this.grid.y = parseInt(String(map(y, gridSize.x, gridSize.y, 0, gridSize.z)), 10)
    this.grid.z = parseInt(String(map(z, gridSize.x, gridSize.y, 0, gridSize.z)), 10)

    this.updateFlags.position = true
  }

  setColor(r: number, g: number, b: number): void {
    this._color.setRGB(r, g, b)
    this.updateFlags.color = true
  }

  show(): void {
    this.mesh?.geometry.show(this)
  }

  hide(): void {
    this.mesh?.geometry.hide(this)
  }
}

/** Current picking id counter, exposed for diagnostics. */
export function peekUidColor(): number {
  return uidColor
}
