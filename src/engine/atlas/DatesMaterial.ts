import { ShaderMaterial, type IUniform, type Texture as ThreeTexture } from 'three'

/** 时间线日期标签使用的材质工厂：`getMaterial(texture)` 返回采样贴图的 shader 材质。 */

const DateMaterialVertexShader = `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;  
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1. );
  }
`

const DateMaterialFragmentShader = `
  precision highp float;
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(map, vUv);
  }
`

export const DatesMaterial = {
  getMaterial(texture: ThreeTexture): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        map: { type: 't', value: texture },
        renderUidColor: { type: 'f', value: 0.0 },
      } as unknown as { [uniform: string]: IUniform },
      vertexShader: DateMaterialVertexShader,
      fragmentShader: DateMaterialFragmentShader,
      depthTest: true,
      depthWrite: true,
      transparent: true,
    })
  },
}
