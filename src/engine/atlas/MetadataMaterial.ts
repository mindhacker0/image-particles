import { ShaderMaterial, type IUniform, type Texture as ThreeTexture } from 'three'

/** 元数据标签使用的材质工厂：`getMaterial(texture)` 返回带 alpha 的 shader 材质。 */

const MetadataMaterialVertexShader = `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;  
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1. );
  }
`

const MetadataMaterialFragmentShader = `
  precision highp float;
  uniform sampler2D map;
  uniform float alpha;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv);
    gl_FragColor = vec4( tex.rgb, tex.a * alpha );
  }
`

export const MetaDataMaterial = {
  getMaterial(texture: ThreeTexture): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        map: { type: 't', value: texture },
        alpha: { type: 'f', value: 0 },
      } as unknown as { [uniform: string]: IUniform },
      vertexShader: MetadataMaterialVertexShader,
      fragmentShader: MetadataMaterialFragmentShader,
      depthTest: true,
      depthWrite: true,
      transparent: false,
    })
  },
}
