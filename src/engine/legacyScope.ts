import type { Vector3 } from 'three'
import { cameraControls } from './camera/CameraControls'
import { Model, getImages as getModelImages } from './data/Models'
import { app, atlas, params, renderEngine } from './Main'

/**
 * 对模块间共享的引擎状态做类型化访问。
 *
 * 状态实际由各自的模块持有（`Main` 持有相机 / 场景 / 渲染器 / 应用，
 * `CameraControls` 持有控制器，`data/Models` 持有数据表），这里只负责类型化读取。
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

/** 请求渲染一帧（按需渲染，由 `RendererEngine` 处理）。 */
export function markRenderNeeded(): void {
  renderEngine?.requestRender()
}

/** 页面参数（由查询字符串和 body 属性构成）。 */
export interface LegacyParams {
  isBigWallVersion?: boolean
  initHash?: string
  directChapter?: string
  directSub?: string
  [key: string]: unknown
}

/** 页面参数访问器。 */
export function legacyParams(): LegacyParams {
  return params as unknown as LegacyParams
}

/** 相机（用到 `position` 与 `far`）。 */
export function legacyCamera(): {
  position: Vector3
  far: number
} {
  return renderEngine.camera as unknown as { position: Vector3; far: number }
}

/** 场景（用到 `add` 与 `remove`）。 */
export function legacyScene(): {
  add(object: unknown): void
  remove(object: unknown): void
} {
  return renderEngine.scene as unknown as { add(object: unknown): void; remove(object: unknown): void }
}

/** 相机控制器。 */
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

/** 应用对象（`prevSeq` 记录上一段序列）。 */
export function legacyApp(): { prevSeq?: string | null } {
  return app as unknown as { prevSeq?: string | null }
}

/** 当前正在构建的图集实例。 */
export function atlasInstance(): AtlasInstance {
  return atlas as unknown as AtlasInstance
}

/** 当前图集的资源列表。 */
export function atlasAssets(): FormulaAsset[] {
  return atlasInstance().assets
}

/** 模型层加载的条目元数据表。 */
export function modelItems(): Record<string, ModelItem> {
  return Model.items as unknown as Record<string, ModelItem>
}

/** 模型层的图片地址解析函数。 */
export function getImages(): GetImages {
  return getModelImages as unknown as GetImages
}
