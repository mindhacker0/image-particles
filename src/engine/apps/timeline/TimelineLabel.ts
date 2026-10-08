import {
  Mesh,
  PlaneGeometry,
  Texture,
  Vector3,
  type Quaternion,
  type ShaderMaterial,
} from 'three'
import { DatesMaterial } from '../../atlas/DatesMaterial'
import { legacyCamera } from '../../legacyScope'

/**
 * 时间线上的单个日期标签：把日期绘制到画布（宽 `size`、高 `size / 4`）、
 * 作为纹理上传，贴到共享的 `1 x 1` 平面上并使用图集的 `DatesMaterial`。
 * `updateQuaternion()` 复制相机朝向，使标签始终面向观察者（由 `Timescroll.update` 调用）。
 *
 * `date` 同时接受数字与字符串，`measureText` / `fillText` 都会将其转为字符串。
 */

/** 所有时间线标签共享的平面几何体。 */
const geometrySc = new PlaneGeometry(1, 1)

/** 递增的标签计数器，构造时打印。 */
let til = 0

/** 仅读取相机的 `quaternion`。 */
function labelCamera(): { quaternion: Quaternion } {
  return legacyCamera() as unknown as { quaternion: Quaternion }
}

/** 将日期绘制到画布。 */
function drawTimelineLabelRect(cnvs: HTMLCanvasElement, date: string | number): void {
  const ctx = cnvs.getContext('2d') as CanvasRenderingContext2D
  // 绘制文字
  const fontSize = 60
  ctx.font = fontSize + 'px Roboto'
  ctx.fillStyle = 'white'
  const bnds = ctx.measureText(String(date))
  const y = cnvs.height
  ctx.fillText(String(date), 0, y - 5)
}

/** 创建标签画布。 */
function createMap(size: number, date: string | number): HTMLCanvasElement {
  const cnvs = document.createElement('canvas')
  cnvs.width = size
  cnvs.height = size / 4
  // 这里调用了 getContext 但未使用其返回值
  cnvs.getContext('2d')
  drawTimelineLabelRect(cnvs, date)
  return cnvs
}

/** 创建标签材质。 */
function createMaterial(map: HTMLCanvasElement): ShaderMaterial {
  const texture = new Texture(map)
  texture.needsUpdate = true
  return DatesMaterial.getMaterial(texture)
}

export class TimelineLabel extends Mesh {
  size: number
  reduceFactor: number
  canvas: HTMLCanvasElement

  constructor(date: string | number, position: Vector3, size?: number, reduceFactor?: number) {
    console.log(til++)

    // 在 `super()` 前用下方成员函数所用的辅助函数构建
    const canvasSize = size || 512
    const canvas = createMap(canvasSize, date)
    super(geometrySc, createMaterial(canvas))

    this.size = canvasSize
    this.reduceFactor = reduceFactor || 6
    this.canvas = canvas
    this.scale.set(80, 20, 1)
    this.position.copy(position)
    this.position.x -= 15
  }

  createMaterial(map: HTMLCanvasElement): ShaderMaterial {
    return createMaterial(map)
  }

  createMap(date: string | number): HTMLCanvasElement {
    return createMap(this.size, date)
  }

  /** 让标签朝向相机。 */
  updateQuaternion(): void {
    this.quaternion.copy(labelCamera().quaternion)
  }

  drawTimelineLabelRect(cnvs: HTMLCanvasElement, date: string | number): void {
    drawTimelineLabelRect(cnvs, date)
  }
}
