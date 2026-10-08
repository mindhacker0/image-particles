import type { Vector3 } from 'three'
import { cameraControls } from './camera/CameraControls'
import { Model, getImages as getModelImages } from './data/Models'
import { app, atlas, camera, params, scene, shared } from './Main'

/**
 * Typed access to the engine state shared between modules.
 *
 * The values live in the modules that own them (`Main` for the camera / scene /
 * renderer / application, `CameraControls` for the controls, `data/Models` for
 * the item table) and are imported here as ESM bindings.
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

/** `renderNeeded` is set when a frame has to be rendered (`Main.animate`). */
export function markRenderNeeded(): void {
  shared.renderNeeded = true
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
  return params as unknown as LegacyParams
}

/** The camera created by `initTHREE` in `js/main.js`. */
export function legacyCamera(): {
  position: Vector3
  far: number
} {
  return camera as unknown as { position: Vector3; far: number }
}

/** The scene created by `initTHREE` in `js/main.js`. */
export function legacyScene(): {
  add(object: unknown): void
  remove(object: unknown): void
} {
  return scene as unknown as { add(object: unknown): void; remove(object: unknown): void }
}

/** Camera controls owned by `js/camera/cameraControls.js`. */
export function legacyCameraControls(): {
  tweening: boolean
  toUrl(): void
  onShift(value: boolean): void
  state: number
} {
  return cameraControls as unknown as {
    tweening: boolean
    toUrl(): void
    onShift(value: boolean): void
    state: number
  }
}

/** The application object built by `js/apps/app_freefall.js`. */
export function legacyApp(): { prevSeq?: string | null } {
  return app as unknown as { prevSeq?: string | null }
}

/** The atlas instance currently being built. */
export function atlasInstance(): AtlasInstance {
  return atlas as unknown as AtlasInstance
}

/** Assets of the atlas currently being built. */
export function atlasAssets(): FormulaAsset[] {
  return atlasInstance().assets
}

/** Items metadata table loaded by the model layer. */
export function modelItems(): Record<string, ModelItem> {
  return Model.items as unknown as Record<string, ModelItem>
}

/** Image url resolver owned by the model layer. */
export function getImages(): GetImages {
  return getModelImages as unknown as GetImages
}
