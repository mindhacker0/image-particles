import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  Vector3,
  type ShaderMaterialParameters,
} from 'three'
import type { Asset } from '../../atlas/Asset'
import { lod } from '../../atlas/lod/lod'
import type { MetadataLabel } from '../../atlas/Metadatas'
import { getUrlsDict } from '../../atlas/utils'
import { atlasInstance, legacyCamera, legacyScene, markRenderNeeded } from '../../legacyScope'
import { gsap } from 'gsap'

/**
 * 片头播放时展示的单张作品图片：将图片绘制到方形画布并作为纹理上传，
 * 再用下方着色器贴到手工构建的四边形上。
 * `start` 淡入并把自身位置交给元数据标签，使其跟随片头；`stop` 淡出并释放资源。
 *
 * 着色器中的 uniform 命名为 `map` 而非 `texture`：
 * WebGL2 上 three 会把 GLSL1 转为 GLSL3，`texture2D` 映射到内置的 `texture()`，
 * 命名为 `texture` 会导致编译失败（画面全黑），请勿修改。
 */

/** 本模块读取的资源字段。 */
type IntroItemAsset = Pick<Asset, 'id' | 'sizeNorm' | 'coords'>

/** 模块对外暴露的接口（即 `introItem` 对象）。 */
export interface IntroItem {
  ready: boolean
  position: Vector3
  init(asset: IntroItemAsset, onReady?: () => void): void
  onUrlLoaded(urls: Record<string, string>): void
  onImageLoaded(): void
  buildMesh(): void
  start(duration?: number): void
  stop(duration?: number): void
  update(): void
  dispose(): void
  buildMaterial(img: HTMLImageElement): ShaderMaterial
  buildGeometry(width: number, height: number): BufferGeometry
}

export const introItem: IntroItem = (function (exports: IntroItem) {
  let asset: IntroItemAsset
  const size = 1024
  let xhr: XMLHttpRequest
  let img: HTMLImageElement
  let geometry: BufferGeometry
  let material: ShaderMaterial
  let mesh: Mesh

  let interval: number

  let callback: (() => void) | undefined
  exports.ready = false
  exports.init = function (_asset, onReady) {
    asset = _asset
    getUrlsDict([asset.id], exports.onUrlLoaded)
    callback = onReady
    exports.ready = true
  }
  exports.onUrlLoaded = function (urls) {
    // `urls` 未使用（原网络请求已移除）
    img = new Image()
    img.onload = function () {
      exports.buildMesh()
    }
    img.src = 'data/berekhat_ram.jpg'
  }

  exports.onImageLoaded = function () {
    img = new Image()
    img.onload = function () {
      exports.buildMesh()
    }
    img.src = window.URL.createObjectURL(xhr.response)
  }

  exports.buildMesh = function () {
    geometry = exports.buildGeometry(asset.sizeNorm.w, asset.sizeNorm.h)
    material = exports.buildMaterial(img)

    material.uniforms.scale.value = new Vector3(asset.coords.w, asset.coords.h, 0.965)
    exports.position = new Vector3(-7.25, 1.5, -1)

    material.uniforms.positionOffset.value = exports.position

    mesh = new Mesh(geometry, material)
    legacyScene().add(mesh)

    if (callback) {
      callback()
    }
  }

  exports.start = function (duration) {
    if (!exports.ready) return
    material.uniforms.opacity.value = 0
    gsap.to(material.uniforms.opacity, { duration: duration || 1, value: 1 })

    // 派发事件以更新元数据
    const assetsBySize: Record<string, string[]> = {}
    assetsBySize[size] = [asset.id]
    lod.events.dispatch('update', { assets: assetsBySize })

    exports.update()
  }

  exports.stop = function (duration) {
    cancelAnimationFrame(interval)
    if (!exports.ready) return

    gsap.to(material.uniforms.opacity, {
      duration: duration || 1,
      value: 0,
      onUpdate: function () {
        markRenderNeeded()
      },
      onComplete: exports.dispose,
    })
  }

  exports.update = function () {
    interval = requestAnimationFrame(exports.update)

    atlasMdLabels().forEach(function (m) {
      m.assetPosition = exports.position
      m.positionOffset = -9.2
    })

    material.uniforms.positionOffset.value = exports.position
    // 标志在 material 上（three 不支持 `uniforms.needsUpdate`）
    material.uniformsNeedUpdate = true
    mesh.lookAt(legacyCamera().position)
    markRenderNeeded()
  }

  // 删除对象并释放资源
  exports.dispose = function () {
    legacyScene().remove(mesh)
    material.uniforms.map.value.dispose()
    material.dispose()
    geometry.dispose()
  }

  // 创建材质
  exports.buildMaterial = function (img) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, size, size)

    // 用画布创建纹理
    const texture = new Texture(canvas)
    texture.needsUpdate = true

    // 创建材质
    return new ShaderMaterial({
      uniforms: {
        map: { type: 't', value: texture },
        ratio: { type: 'f', value: 1 },
        scale: { type: 'v3', value: new Vector3() },
        positionOffset: { type: 'v3', value: new Vector3() },
        opacity: { type: 'f', value: 0 },
      } as unknown as ShaderMaterialParameters['uniforms'],

      vertexShader: vs,
      fragmentShader: fs,
      transparent: true,
      depthWrite: true,
      depthTest: true,
    })
  }

  // 创建几何体
  // （遗留的未使用几何体：`buildGeometry` 会构建自己的几何体；
  // `PlaneBufferGeometry` 在 three r144 中移除，改用 `PlaneGeometry`）
  const planeGeom = new PlaneGeometry(1, 1)
  exports.buildGeometry = function (width, height) {
    const vertices = new Float32Array(4 * 3)
    const uvs = new Float32Array(2 * 4)
    const indices = new Uint16Array(2 * 3)
    let k: number, v: number, w: number, h: number

    w = 0.5
    h = 0.5

    k = 0
    vertices[k++] = -w
    vertices[k++] = -h
    vertices[k++] = 0
    vertices[k++] = w
    vertices[k++] = -h
    vertices[k++] = 0
    vertices[k++] = -w
    vertices[k++] = h
    vertices[k++] = 0
    vertices[k++] = w
    vertices[k++] = h
    vertices[k++] = 0

    k = 0
    uvs[k++] = 0
    uvs[k++] = 0

    uvs[k++] = 1
    uvs[k++] = 0

    uvs[k++] = 0
    uvs[k++] = 1

    uvs[k++] = 1
    uvs[k++] = 1

    k = 0
    v = 0
    indices[k++] = v
    indices[k++] = v + 3
    indices[k++] = v + 2
    indices[k++] = v + 3
    indices[k++] = v
    indices[k++] = v + 1

    const geometry = new BufferGeometry()
    // three r125 起 `addAttribute` 更名为 `setAttribute`
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setIndex(new BufferAttribute(indices, 1))
    // `BufferGeometry` 没有 `needsUpdate` 成员，故不设置
    return geometry
  }

  // `vs` / `fs` 由 `buildMaterial` 使用，而后者在 IIFE 执行后才运行
  const vs = `
// three 注入的内置 attribute：position、uv
varying vec2 vUv;
uniform float ratio;
uniform vec3 scale;
uniform vec3 positionOffset;

void main() {
	vUv = uv;
	
	vec4 transform = modelViewMatrix * vec4( position, 1.0 );
	
	transform.xyz *= scale;
	transform.xyz += positionOffset;
	
	// 投影位置
	vec4 projection = projectionMatrix * transform;
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
    
    // 与雾色混合
    gl_FragColor = vec4( color.rgb, opacity );
    
}`

  return exports
})({} as IntroItem)

/**
 * 片头条目会把元数据标签移动到自身位置，因此这里只读取 `mdLabels.labels`。
 */
function atlasMdLabels(): MetadataLabel[] {
  return (atlasInstance() as unknown as { mdLabels: { labels: MetadataLabel[] } }).mdLabels.labels
}
