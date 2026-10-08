import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  type ShaderMaterialParameters,
  type WebGLRenderer,
} from 'three'
import { gsap } from 'gsap'
import { renderer } from '../Main'
import { atlasInstance, legacyCamera, markRenderNeeded } from '../legacyScope'
import { canvasUtils } from '../utils/canvas'
import { GrowingPacker, type PackerBlock, type PackerNode } from '../utils/GrowingPacker'
import { norm } from '../utils/math'

/**
 * 时间线日期标签渲染器。
 * 使用 canvas 生成文本贴图，再由 shader 以条带形式展示。
 */

/** 时间线数据块。 */
export interface DateLabelBlock {
  year: string | number
  [key: string]: unknown
}

/** 日期标签字体设置。 */
export interface DateLabelFont {
  color: string
  size: number
  padding: number
  type: string
}

/** 绑定了 `show` / `hide` 方法的标签网格。 */
type DateLabelsMesh = Mesh & {
  show(duration?: number): void
  hide(duration?: number): void
}

interface DateLabels {
  /** 重复调用时返回 `undefined`（第二次调用不再创建）。 */
  init(dates: DateLabelBlock[], spacing: number, font?: DateLabelFont): DateLabelsMesh | undefined
  update(): void
  show(duration?: number): void
  hide(duration?: number): void
}

/** 纹理打包所需的标签矩形信息。 */
interface LabelRect extends PackerBlock {
  w: number
  h: number
  fit?: PackerNode | null
  year: string | number
  block: DateLabelBlock
}

// 模块私有状态
let material: ShaderMaterial
let canvas: HTMLCanvasElement
let context: CanvasRenderingContext2D
// 保留字段（未使用）
let interval: number
const materials: ShaderMaterial[] = []
let mesh: DateLabelsMesh
let ready = false

/** 主渲染器实例。 */
function legacyRenderer(): WebGLRenderer {
  return renderer
}

function isPowerOfTwo(value: number): boolean {
  return (value & -value) == value
}

function powerTwoCeiling(val: number): number {
  if (isPowerOfTwo(val)) return val
  val = Math.pow(2, Math.ceil(Math.log(Math.sqrt(val)) / Math.LN2))
  return val * val
}

/** 时间线日期标签的单例模块。 */
export const dateLabels: DateLabels = (function (exports: DateLabels) {
  /**
   * @param dates 所有日期数据
   * @param font 使用的字体设置
   * @constructor
   */
  exports.init = function (
    dates: DateLabelBlock[],
    spacing: number,
    font?: DateLabelFont,
  ): DateLabelsMesh | undefined {
    if (ready) return
    ready = true

    // TODO：补充颜色 uniform
    font = font || { color: '#FFF', size: 60, padding: 5, type: 'verdana' }

    // 计算每个日期文本的矩形
    const rects: LabelRect[] = []
    let rect: LabelRect

    for (let i = 0; i < dates.length; i++) {
      const block = dates[i]
      // `measureText` 返回 { w, h }，随后再补上源数据
      rect = canvasUtils.measureText(String(block.year), font, font.padding) as unknown as LabelRect
      rect.year = block.year
      rect.block = block
      rects.push(rect)
    }

    // 创建 canvas
    canvas = document.createElement('canvas')
    context = canvas.getContext('2d') as CanvasRenderingContext2D

    const packer = new GrowingPacker()
    packer.fit(rects)
    packer.root.w = canvas.width = powerTwoCeiling(packer.root.w)
    packer.root.h = canvas.height = powerTwoCeiling(packer.root.h)

    // 在 canvas 上绘制文本
    for (let j = 0; j < rects.length; j++) {
      rect = rects[j]
      // `fit()` 会为每个块设置节点，这里的类型断言仅为满足 TS
      const fit = rect.fit as PackerNode

      context.save()
      context.translate(fit.x, fit.y)

      context.fillStyle = font.color
      context.font = font.size + 'px ' + font.type

      context.fillStyle = font.color
      // fillText 会把参数转为字符串
      context.fillText(String(rect.year), font.padding, font.size - font.padding)

      context.restore()
    }

    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'

    // 创建几何体
    const spriteCount = rects.length

    const vertices = new Float32Array(spriteCount * 4 * 3)
    const uvs = new Float32Array(spriteCount * 2 * 4)
    const offsets = new Float32Array(spriteCount * 2 * 4)
    const indices = new Uint16Array(spriteCount * 2 * 3)

    const totalWidth = packer.root.w
    const totalHeight = packer.root.h

    let k: number, v: number, x: number, y: number, z: number, w: number, h: number
    for (let i = 0; i < spriteCount; i++) {
      rect = rects[i]
      const fit = rect.fit as PackerNode

      w = rect.w / 2
      h = rect.h / 2

      x = i * spacing
      y = 0
      z = 0

      k = i * 8
      offsets[k++] = -w
      offsets[k++] = -h
      offsets[k++] = w
      offsets[k++] = -h
      offsets[k++] = -w
      offsets[k++] = h
      offsets[k++] = w
      offsets[k++] = h

      k = i * 12
      vertices[k++] = x
      vertices[k++] = y
      vertices[k++] = z
      vertices[k++] = x
      vertices[k++] = y
      vertices[k++] = z
      vertices[k++] = x
      vertices[k++] = y
      vertices[k++] = z
      vertices[k++] = x
      vertices[k++] = y
      vertices[k++] = z

      k = i * 8
      uvs[k++] = fit.x / totalWidth
      uvs[k++] = 1 - (fit.y + rect.h) / totalHeight
      uvs[k++] = (fit.x + rect.w) / totalWidth
      uvs[k++] = 1 - (fit.y + rect.h) / totalHeight
      uvs[k++] = fit.x / totalWidth
      uvs[k++] = 1 - fit.y / totalHeight
      uvs[k++] = (fit.x + rect.w) / totalWidth
      uvs[k++] = 1 - fit.y / totalHeight

      k = i * 6
      v = i * 4
      indices[k++] = v
      indices[k++] = v + 3
      indices[k++] = v + 2
      indices[k++] = v + 3
      indices[k++] = v
      indices[k++] = v + 1
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('offset', new BufferAttribute(offsets, 2))
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setIndex(new BufferAttribute(indices, 1))

    const texture = new Texture(canvas)
    texture.needsUpdate = true

    // 创建材质
    const r = new Vector2()
    legacyRenderer().getSize(r)
    material = new ShaderMaterial({
      uniforms: {
        map: { type: 't', value: texture },
        ratio: { type: 'f', value: r.width / r.height },
        scale: { type: 'f', value: 1 },
        opacity: { type: 'f', value: 1 },

        ///雾
        fogColor: { type: 'v3', value: new Vector3() },
        fogDistance: { type: 'f', value: 100000 },
      } as unknown as ShaderMaterialParameters['uniforms'],

      vertexShader: vs,
      fragmentShader: fs,
      transparent: true,
      depthWrite: true,
      depthTest: true,
    })
    materials.push(material)

    // 将 `show` / `hide` 辅助方法挂到网格实例上
    mesh = new Mesh(geometry, material) as unknown as DateLabelsMesh
    mesh.show = function (duration?: number) {
      mesh.visible = true
      gsap.to(material.uniforms.opacity, {
        duration: duration || 1,
        overwrite: true,
        value: 1,
        onUpdate: function () {
          markRenderNeeded()
        },
      })
    }
    mesh.hide = function (duration?: number) {
      gsap.to(material.uniforms.opacity, {
        duration: duration || 1,
        value: 0,
        onUpdate: function () {
          markRenderNeeded()
        },
        onComplete: function () {
          mesh.visible = false
        },
      })
    }

    ready = true
    ;(atlasInstance() as unknown as { datesMaterial: unknown }).datesMaterial = material

    exports.update()
    return mesh
  }

  exports.update = function (): void {
    const r = new Vector2()
    legacyRenderer().getSize(r)
    materials.forEach((labelMaterial) => {
      labelMaterial.uniforms.ratio.value = r.width / r.height
      labelMaterial.uniforms.scale.value =
        0.01 + norm(Math.min(legacyCamera().position.z, 1000), 0, 1000) * 0.65
    })
  }

  exports.show = function (duration?: number): void {
    if (!ready) return
    mesh.visible = true
    material.uniforms.opacity.value = 0
    gsap.to(material.uniforms.opacity, { duration: duration || 0, value: 1 })
  }

  exports.hide = function (duration?: number): void {
    if (!ready) return
    gsap.to(material.uniforms.opacity, {
      duration: duration || 0,
      value: 0,
      onComplete: function () {
        mesh.visible = false
      },
    })
  }

  const vs = `
attribute vec2 offset;
varying vec2 vUv;
uniform float ratio;
uniform float scale;

void main() {
	vUv = uv;
	
	// 投影位置
	vec4 projection = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	
	// 偏移四角
    projection.x += scale * offset.x;
    projection.y += scale * offset.y * ratio;
    
	gl_Position = projection;
}`

  const fs = `
uniform vec3 fogColor;
uniform float fogDistance;
  
// 不能命名为 texture：three 在 WebGL2 上把 GLSL1 转成 GLSL3，
// 其中 texture2D 映射到内置的 texture() 函数。
uniform sampler2D map;
uniform float opacity;
varying vec2 vUv;
void main(){

    // 采样纹理
    vec4 color = texture2D( map, vUv );
    
    // 雾
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float d = clamp( 0., 1., pow( depth * ( 1./fogDistance ), 2. ) );
    if( d >= 1. ) discard;
    
    // 混入雾色
    gl_FragColor = vec4( mix( color.rgb, fogColor, d ), opacity );
    
}`

  return exports
})({} as DateLabels)
