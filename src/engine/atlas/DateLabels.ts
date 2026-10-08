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
 *
 * Draws the timeline date labels. Every year is painted into one canvas that is
 * packed with `GrowingPacker`, uploaded as a single texture and rendered as a
 * strip of quads: all four vertices of a label share the same `position` (the x
 * of the label slot) while the quad corners live in the `offset` attribute, so
 * the vertex shader expands them in screen space. The material is published on
 * the atlas (`atlas.datesMaterial`) because `js/atlas/atlas.js` tweens its fog
 * uniforms.
 *
 * Notes on the non-obvious parts of the port:
 * - The module keeps module level state and a `ready` flag, so `init()` only
 *   ever runs once - the original relied on exactly the same flag (it declared
 *   `ready` twice, the second declaration being dead code).
 * - `interval` is declared although the original never used it either; it is
 *   kept so the module state matches the original.
 * - `BufferGeometry#addAttribute` (three < r125) is now `setAttribute`.
 * - The `type: "f" | "v3" | "t"` entries of the uniforms descriptor are a
 *   three < r125 leftover: modern three ignores the extra field and reads
 *   `value`, so the descriptor is cast instead of being rewritten.
 * - The label uniform is called `map` and not `texture`: three defines
 *   `texture2D` -> `texture` when it converts GLSL1 to GLSL3 on WebGL2, so a
 *   uniform named `texture` fails to compile.
 * - `renderer`, `camera` and `renderNeeded` are still owned by `js/main.js`
 *   (the render loop), `atlas.datesMaterial` by the not-yet-ported atlas.
 */

/** One entry of the `dates` array built by `js/apps/timeline/timescroll.js`. */
export interface DateLabelBlock {
  year: string | number
  [key: string]: unknown
}

export interface DateLabelFont {
  color: string
  size: number
  padding: number
  type: string
}

/** The mesh carries the `show` / `hide` helpers the original attaches to it. */
type DateLabelsMesh = Mesh & {
  show(duration?: number): void
  hide(duration?: number): void
}

interface DateLabels {
  /** `undefined` when called a second time: the original returned nothing then. */
  init(dates: DateLabelBlock[], spacing: number, font?: DateLabelFont): DateLabelsMesh | undefined
  update(): void
  show(duration?: number): void
  hide(duration?: number): void
}

/** Text measurement of one label plus its packer node and its source block. */
interface LabelRect extends PackerBlock {
  w: number
  h: number
  fit?: PackerNode | null
  year: string | number
  block: DateLabelBlock
}

// module private state
let material: ShaderMaterial
let canvas: HTMLCanvasElement
let context: CanvasRenderingContext2D
// declared (and never used) by the original as well: kept so the module state matches
let interval: number
const materials: ShaderMaterial[] = []
let mesh: DateLabelsMesh
let ready = false

/** the renderer created by `Main.initTHREE` */
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

export const dateLabels: DateLabels = (function (exports: DateLabels) {
  /**
   * @param dates array of all dates
   * @param font which font to use
   * @constructor
   */
  exports.init = function (
    dates: DateLabelBlock[],
    spacing: number,
    font?: DateLabelFont,
  ): DateLabelsMesh | undefined {
    // spacing = spacing || 100;

    if (ready) return
    ready = true

    //todo add color uniform
    font = font || { color: '#FFF', size: 60, padding: 5, type: 'verdana' }

    // get rects
    const rects: LabelRect[] = []
    let rect: LabelRect

    for (let i = 0; i < dates.length; i++) {
      const block = dates[i]
      // `measureText` returns { w, h }; the rect is completed with the source
      // data right after (the original did the same on its `rect` variable)
      rect = canvasUtils.measureText(String(block.year), font, font.padding) as unknown as LabelRect
      rect.year = block.year
      rect.block = block
      rects.push(rect)
    }

    // setup the canvas
    canvas = document.createElement('canvas')
    context = canvas.getContext('2d') as CanvasRenderingContext2D

    const packer = new GrowingPacker()
    packer.fit(rects)
    packer.root.w = canvas.width = powerTwoCeiling(packer.root.w)
    packer.root.h = canvas.height = powerTwoCeiling(packer.root.h)

    // draw on the canvas
    for (let j = 0; j < rects.length; j++) {
      rect = rects[j]
      // `fit()` sets a node on every block it is given, the cast is only for TS
      const fit = rect.fit as PackerNode

      context.save()
      context.translate(fit.x, fit.y)

      context.fillStyle = font.color
      context.font = font.size + 'px ' + font.type

      context.fillStyle = font.color
      // fillText stringifies its argument, exactly like the original did
      context.fillText(String(rect.year), font.padding, font.size - font.padding)

      context.restore()
    }

    // document.body.appendChild( canvas );
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'

    // create the geometry
    const spriteCount = rects.length

    const vertices = new Float32Array(spriteCount * 4 * 3)
    const uvs = new Float32Array(spriteCount * 2 * 4)
    const offsets = new Float32Array(spriteCount * 2 * 4)
    const indices = new Uint16Array(spriteCount * 2 * 3)

    const totalWidth = packer.root.w
    const totalHeight = packer.root.h

    let k: number, v: number, x: number, y: number, z: number, w: number, h: number
    // the original reused the loop counter of the rects loop above (an implicit
    // global left over from `for (var i = ...)`), here it is declared locally
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
    // `addAttribute` was renamed to `setAttribute` in three r125
    geometry.setAttribute('offset', new BufferAttribute(offsets, 2))
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setIndex(new BufferAttribute(indices, 1))

    // update the canvas to the gc < ..?
    const texture = new Texture(canvas)
    texture.needsUpdate = true

    // create the material
    const r = new Vector2()
    legacyRenderer().getSize(r)
    material = new ShaderMaterial({
      uniforms: {
        map: { type: 't', value: texture },
        ratio: { type: 'f', value: r.width / r.height },
        scale: { type: 'f', value: 1 },
        opacity: { type: 'f', value: 1 },

        ///fog
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
    // console.log( material )

    // the `show` / `hide` helpers are attached to the mesh instance, as in the original
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
	
	//project position
	vec4 projection = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	
	//offset the corners
    projection.x += scale * offset.x;
    projection.y += scale * offset.y * ratio;
    
	gl_Position = projection;
}`

  const fs = `
uniform vec3 fogColor;
uniform float fogDistance;
  
// texture is reserved: three converts GLSL1 shaders to GLSL3 on WebGL2,
// where texture2D maps onto the built-in texture() function.
uniform sampler2D map;
uniform float opacity;
varying vec2 vUv;
void main(){

    //texture
    vec4 color = texture2D( map, vUv );
    
    //fog
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float d = clamp( 0., 1., pow( depth * ( 1./fogDistance ), 2. ) );
    if( d >= 1. ) discard;
    
    //blend
    gl_FragColor = vec4( mix( color.rgb, fogColor, d ), opacity );
    
}`

  return exports
})({} as DateLabels)
