import { ShaderMaterial, Vector3, type IUniform, type Texture as ThreeTexture } from 'three'

/**
 * 图集实例化材质：顶点着色器在当前与目标 attribute 之间插值，
 * 片元着色器采样图集纹理。
 */

const MaterialVertexShader = `
  precision mediump float;

  // three 注入的内置 uniform：modelViewMatrix、projectionMatrix
  uniform float transitionPct;

  uniform float wavesOffset;
  uniform float wavesAmp;
  // three 注入的内置 attribute：position、uv

  attribute float tween;
  attribute vec2 uvOffset;
  attribute vec3 translate;
  attribute vec3 translateDest;
  attribute vec3 scale;
  attribute vec3 color;
  attribute vec3 colorDest;
  attribute vec3 uidColor;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vUidColor;
  varying float vTween;

  #define PI 3.14159
  void main() {
    float pct = transitionPct * tween;
    vec3 p = mix( translate, translateDest, pct );

    // 原始（网格）版本
    /*
    if (wavesAmp > 0.0) {
      p.y += sin(wavesOffset+p.x/1200.0) * wavesAmp - sin(wavesOffset+p.z/800.0) * wavesAmp;
    }
    //*/

    // 在原始版本上调整，以适配圆盘造型与新尺寸
    if (wavesAmp > 0.0) {
      p.xz *= 1. + 1.0 * wavesAmp;
      p.y += ( sin(wavesOffset+p.x/1800.0) - sin(wavesOffset+p.z/1600.0 ) ) * wavesAmp * 500.;
    }

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    vTween = tween;

    mvPosition.xyz += position * scale;
    vUv = uvOffset.xy + uv * scale.xy;

    vColor = mix( color, colorDest, pct );

    // 拾取时使用的颜色
    vUidColor = uidColor;

    gl_Position = projectionMatrix * mvPosition;

  }
`

const MaterialFragmentShader = `
  precision mediump float;

  uniform sampler2D map;
  uniform float renderUidColor;
  uniform vec3 fogColor;
  uniform float fogDistance;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vUidColor;
  varying float vTween;

  void main() {

    if( length( vColor ) < .1 )discard;
    
    gl_FragColor = vec4( 0., 0., 0., 1. );
    
    vec4 diffuseColor = texture2D( map, vUv) * vec4(vColor, 1.0) * vTween;
    gl_FragColor += diffuseColor;

     
    if( renderUidColor == 1. ){
        
        gl_FragColor = vec4( vUidColor, 1. );
        
    }

    /*
    else{
    
        // 雾
        float depth = gl_FragCoord.z / gl_FragCoord.w;
        float d = clamp( 0., 1., pow( depth * ( 1./fogDistance ), 2. ) );
        if( d >= 1. ) discard;
    
        vec4 diffuseColor = texture2D(map, vUv);
        gl_FragColor = diffuseColor * vec4(vColor, 1.0) * vTween;
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, d );
    }
    //*/
  }
`

/** 封装图集 shader 材质的工厂。 */
export class Material {
  material: ShaderMaterial

  constructor(texture: ThreeTexture) {
    this.material = new ShaderMaterial({
      uniforms: {
        map: { type: 't', value: texture },
        transitionPct: { type: 'f', value: 0.0 },
        wavesOffset: { type: 'f', value: 0.0 },
        wavesAmp: { type: 'f', value: 0.0 },
        renderUidColor: { type: 'f', value: 0.0 },

        // 雾效
        fogColor: { type: 'v3', value: new Vector3() },
        fogDistance: { type: 'f', value: 100000 },
      } as unknown as { [uniform: string]: IUniform },
      vertexShader: MaterialVertexShader,
      fragmentShader: MaterialFragmentShader,
      depthTest: true,
      depthWrite: true,
    })
  }
}
