import {
  BackSide,
  IcosahedronGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
  type ShaderMaterialParameters,
} from 'three'
import { legacyCamera, legacyScene } from '../legacyScope'

/**
 * t-SNE 章节使用的背景球体。
 * 外部只读取 `tsneSphere.mesh` 来控制其显示 / 隐藏。
 *
 * uniforms 保留旧的 `type` 描述字段：新版 three 会忽略它，只使用 `value`。
 */

const vertexShader = `
varying float y;
void main() {
    y  = position.y;
    gl_Position= projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`

const fragmentShader = `
uniform vec3 top;
uniform vec3 bottom;
uniform float threshold;
varying float y;

void main(){
    vec3 color = mix( bottom, top, smoothstep( -threshold, threshold, y ) );
    gl_FragColor = vec4( color, 1. );
}`

/** t-SNE 球体的公共接口。 */
export interface TsneSphere {
  mesh: Mesh | null
  init(): void
  dispose(): void
}

function createTsneSphere(): TsneSphere {
  let mesh: Mesh | null = null

  const tsneSphere: TsneSphere = {
    mesh: null,

    init() {
      if (mesh == null) {
        const geometry = new IcosahedronGeometry(1, 2)

        const grey = 0.75
        const material = new ShaderMaterial({
          uniforms: {
            top: { type: 'v3', value: new Vector3(1, 1, 1) },
            bottom: { type: 'v3', value: new Vector3(grey, grey, grey) },
            threshold: { type: 'f', value: 0.075 },
          } as unknown as ShaderMaterialParameters['uniforms'],
          vertexShader,
          fragmentShader,
          side: BackSide,
          depthWrite: false,
          depthTest: true,
        })

        mesh = new Mesh(geometry, material)

        const scale = legacyCamera().far * 0.5
        mesh.scale.multiplyScalar(scale)
        tsneSphere.mesh = mesh
      }

      legacyScene().add(mesh)
    },

    dispose() {
      legacyScene().remove(mesh)
    },
  }

  return tsneSphere
}

/** t-SNE 球体单例。 */
export const tsneSphere = createTsneSphere()
