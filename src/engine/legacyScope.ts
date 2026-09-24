import type { Vector3 } from 'three'

/**
 * Access to the legacy globals that the not-yet-ported modules still own.
 *
 * Keeping these lookups in one place makes the remaining global dependencies
 * explicit, and they disappear as the owning modules get ported:
 */

export interface FormulaAsset {
  position: Vector3
  setPosition(x: number, y: number, z: number): void
  setColor(r: number, g: number, b: number): void
}

export interface AtlasInstance {
  assets: FormulaAsset[]
  getAsset(id: string): FormulaAsset | undefined
  addAsset(id: string, mesh: unknown): void
}

export interface ModelItem {
  image_url?: string
  year?: number
}

export type GetImages = (
  ids: string,
  fromAllChannels: boolean | undefined,
  results: string[],
  callback: (urls: Record<string, string>) => void,
) => void

interface LegacyScope {
  atlas: AtlasInstance
  Model: { items: Record<string, ModelItem> }
  getImages: GetImages
}

function scope(): LegacyScope {
  return window as unknown as LegacyScope
}

/** `renderNeeded` is a plain global owned by the render loop in `js/main.js`. */
export function markRenderNeeded(): void {
  ;(window as unknown as { renderNeeded: boolean }).renderNeeded = true
}

/** Page parameters built by `js/main.js` (query string + body attributes). */
export interface LegacyParams {
  isBigWallVersion?: boolean
  initHash?: string
  directChapter?: string
  directSub?: string
  [key: string]: unknown
}

export function legacyParams(): LegacyParams {
  return (window as unknown as { params: LegacyParams }).params
}

/** The camera created by `initTHREE` in `js/main.js`. */
export function legacyCamera(): {
  position: Vector3
  far: number
  getWorldQuaternion(): { x: number; y: number; z: number; w: number }
} {
  return (window as unknown as { camera: ReturnType<typeof legacyCamera> }).camera
}

/** The scene created by `initTHREE` in `js/main.js`. */
export function legacyScene(): {
  add(object: unknown): void
  remove(object: unknown): void
} {
  return (window as unknown as { scene: ReturnType<typeof legacyScene> }).scene
}

/** Camera controls owned by `js/camera/cameraControls.js`. */
export function legacyCameraControls(): {
  tweening: boolean
  toUrl(): void
  onShift(value: boolean): void
  state: number
} {
  return (window as unknown as { cameraControls: ReturnType<typeof legacyCameraControls> }).cameraControls
}

/** The application object built by `js/apps/app_freefall.js`. */
export function legacyApp(): { prevSeq?: string | null } {
  return (window as unknown as { app: ReturnType<typeof legacyApp> }).app
}

/** The atlas instance currently being built. */
export function atlasInstance(): AtlasInstance {
  return scope().atlas
}

/** Assets of the atlas currently being built. */
export function atlasAssets(): FormulaAsset[] {
  return scope().atlas.assets
}

/** Items metadata table loaded by the model layer. */
export function modelItems(): Record<string, ModelItem> {
  return scope().Model.items
}

/** Image url resolver owned by the model layer. */
export function getImages(): GetImages {
  return scope().getImages
}
