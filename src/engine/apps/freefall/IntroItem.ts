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
import { TweenLite } from '../../../legacy/gsapLegacy'

/**
 *
 * The single artwork shown while the freefall intro plays: an image is drawn into
 * a square canvas, uploaded as a texture and displayed on a hand built quad with
 * the shader below. `start` fades it in and hands its position to the metadata
 * labels so they follow the intro; `stop` fades it out and disposes everything.
 *
 * Port notes:
 * - the module keeps the IIFE shape of the original
 *   (`(function (exports) { ... })({})`) so `introItem` stays a single object
 *   with the same members
 * - the fragment shader declares `uniform sampler2D map` and not `texture`:
 *   three converts GLSL1 shaders to GLSL3 on WebGL2, where `texture2D` maps onto
 *   the built-in `texture()` function, so a uniform named `texture` would break
 *   the compile (black canvas). The original already used `map`; do not change it
 * - `getUrlsDict`, `lod` and `TweenLite` are imported from their already ported
 *   modules; the still classic globals (`scene`, `camera`, `renderer`,
 *   `renderNeeded`, `atlas`, `window.URL`) are read through small getters at the
 *   end of this file or through `src/engine/legacyScope.ts`
 * - `material.uniforms.needsUpdate = true` of the original was a no-op (the flag
 *   is `uniformsNeedUpdate` on the material), so the modern flag is set instead:
 *   the intended uniform refresh still happens
 * - `BufferGeometry#needsUpdate = true` of the original is dropped: the member
 *   never existed on `BufferGeometry` and does not exist in current three either
 * - `addAttribute` is `setAttribute` since three r125 and the unused
 *   `PlaneBufferGeometry` left over in the module is now a `PlaneGeometry`
 */

/** The parts of an atlas asset (`src/engine/atlas/Asset.ts`) this module reads. */
type IntroItemAsset = Pick<Asset, 'id' | 'sizeNorm' | 'coords'>

/** The public surface of the module, i.e. the legacy `introItem` object. */
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
    // `urls` is only used by the commented out request below, as in the original
    img = new Image()
    img.onload = function () {
      exports.buildMesh()
    }
    img.src = 'data/berekhat_ram.jpg'

    /*
    var url = urls[ asset.id ].replace( 'http:', 'https:' ) + "=s" + size;
    xhr = new XMLHttpRequest();
    xhr.onload = exports.onImageLoaded;
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.send();
    //*/
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
    //console.log( asset );
    // console.log(mesh);
    // console.log( material);
  }

  exports.start = function (duration) {
    if (!exports.ready) return
    material.uniforms.opacity.value = 0
    TweenLite.to(material.uniforms.opacity, duration || 1, { value: 1 })

    // dispatch an event to update the metadata
    const assetsBySize: Record<string, string[]> = {}
    assetsBySize[size] = [asset.id]
    lod.events.dispatch('update', { assets: assetsBySize })

    exports.update()
  }

  exports.stop = function (duration) {
    cancelAnimationFrame(interval)
    if (!exports.ready) return

    TweenLite.to(material.uniforms.opacity, duration || 1, {
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
    // the original wrote `material.uniforms.needsUpdate = true`, which three
    // never supported: the flag lives on the material
    material.uniformsNeedUpdate = true
    mesh.lookAt(legacyCamera().position)
    markRenderNeeded()
  }

  //deletes the object and resources
  exports.dispose = function () {
    legacyScene().remove(mesh)
    material.uniforms.map.value.dispose()
    material.dispose()
    geometry.dispose()
  }

  // create the material
  exports.buildMaterial = function (img) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, size, size)

    // update the canvas to the gc < ..?
    const texture = new Texture(canvas)
    texture.needsUpdate = true

    // create the material
    // (the original stored the renderer size in an unused variable here: the call
    // is kept so the module reads the same global at the same moment)
    legacyRenderer().getSize()
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

  // create the geometry
  // (dead left over of the original: `buildGeometry` below builds its own
  // geometry. `PlaneBufferGeometry` was removed in three r144 -> `PlaneGeometry`)
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
    uvs[k++] = 0 //rect.fit.x / totalWidth;
    uvs[k++] = 0 //1 - (rect.fit.y + rect.h) / totalHeight;

    uvs[k++] = 1 //(rect.fit.x + rect.w) / totalWidth;
    uvs[k++] = 0 //1 - (rect.fit.y + rect.h) / totalHeight;

    uvs[k++] = 0 //rect.fit.x / totalWidth;
    uvs[k++] = 1 //1 - rect.fit.y / totalHeight;

    uvs[k++] = 1 //(rect.fit.x + rect.w) / totalWidth;
    uvs[k++] = 1 //1 - rect.fit.y / totalHeight;

    k = 0
    v = 0
    indices[k++] = v
    indices[k++] = v + 3
    indices[k++] = v + 2
    indices[k++] = v + 3
    indices[k++] = v
    indices[k++] = v + 1

    const geometry = new BufferGeometry()
    // `addAttribute` was renamed to `setAttribute` in three r125
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setIndex(new BufferAttribute(indices, 1))
    // the original also wrote `geometry.needsUpdate = true`: `BufferGeometry`
    // never carried that member, so the line is dropped
    return geometry
  }

  // `vs` / `fs` are referenced by `buildMaterial`, which only runs after the IIFE
  const vs = `
// attribute vec2 offset;
varying vec2 vUv;
uniform float ratio;
uniform vec3 scale;
uniform vec3 positionOffset;

void main() {
	vUv = uv;
	
	vec4 transform = modelViewMatrix * vec4( position, 1.0 );
	
	transform.xyz *= scale;
	transform.xyz += positionOffset;
	
	//project position
	vec4 projection = projectionMatrix * transform;
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
    
    //blend
    gl_FragColor = vec4( color.rgb, opacity );
    
}`

  return exports
})({} as IntroItem)

/**
 * `atlas` (`js/atlas/atlas.js`): the intro item moves the metadata labels of the
 * atlas onto its own position, so only `mdLabels.labels` is read here.
 */
function atlasMdLabels(): MetadataLabel[] {
  return (atlasInstance() as unknown as { mdLabels: { labels: MetadataLabel[] } }).mdLabels.labels
}

/** legacy global owned by `js/main.js` (the render loop) */
function legacyRenderer(): { getSize(): { width: number; height: number } } {
  return (window as unknown as { renderer: { getSize(): { width: number; height: number } } }).renderer
}
