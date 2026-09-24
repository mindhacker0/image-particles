import * as THREE from 'three'

/**
 * The legacy engine targets an old Three.js revision. These shims restore the
 * handful of APIs that were renamed or removed since, so the untouched legacy
 * sources keep running against the npm build of three.
 *
 *   PlaneBufferGeometry               -> PlaneGeometry               (removed in r144)
 *   BufferGeometry#addAttribute       -> setAttribute                (removed in r125)
 *   BufferGeometry#removeAttribute    -> deleteAttribute             (removed in r125)
 *   BufferAttribute#setDynamic        -> setUsage(DynamicDrawUsage)  (removed in r125)
 *   InstancedBufferGeometry           -> instanceCount               (renamed in r128)
 *     #maxInstancedCount
 *   Object3D#getWorldQuaternion()      -> getWorldQuaternion(target)  (target now required)
 *   WebGLRenderer#getSize()           -> getSize(target)             (target now required)
 */
export function applyThreePrototypeCompat(): void {
  const bufferGeometry = THREE.BufferGeometry.prototype as unknown as Record<string, unknown>

  if (typeof bufferGeometry.addAttribute !== 'function') {
    bufferGeometry.addAttribute = THREE.BufferGeometry.prototype.setAttribute
  }

  if (typeof bufferGeometry.removeAttribute !== 'function') {
    bufferGeometry.removeAttribute = THREE.BufferGeometry.prototype.deleteAttribute
  }

  const bufferAttribute = THREE.BufferAttribute.prototype as unknown as Record<string, unknown>

  if (typeof bufferAttribute.setDynamic !== 'function') {
    bufferAttribute.setDynamic = function setDynamic(this: THREE.BufferAttribute, value: boolean) {
      return this.setUsage(value ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage)
    }
  }

  // `getWorldQuaternion()` (and friends) used to create their own result when no
  // target was passed; the legacy LOD code calls them without arguments.
  const object3dPrototype = THREE.Object3D.prototype as unknown as Record<string, unknown>
  const createTargetDefault = (
    methodName: 'getWorldQuaternion' | 'getWorldPosition' | 'getWorldScale',
    createTarget: () => object,
  ) => {
    const original = THREE.Object3D.prototype[methodName] as unknown as (
      this: THREE.Object3D,
      target: object,
    ) => object

    object3dPrototype[methodName] = function (this: THREE.Object3D, target?: object) {
      return original.call(this, target ?? createTarget())
    }
  }

  createTargetDefault('getWorldQuaternion', () => new THREE.Quaternion())
  createTargetDefault('getWorldPosition', () => new THREE.Vector3())
  createTargetDefault('getWorldScale', () => new THREE.Vector3())

  // `maxInstancedCount` was renamed to `instanceCount` (r128). The legacy atlas
  // geometry both reads it (buffer sizing) and writes it (draw count).
  const instancedGeometry = THREE.InstancedBufferGeometry.prototype as unknown as Record<string, unknown>

  if (!('maxInstancedCount' in instancedGeometry)) {
    Object.defineProperty(instancedGeometry, 'maxInstancedCount', {
      configurable: true,
      get(this: THREE.InstancedBufferGeometry) {
        return this.instanceCount
      },
      set(this: THREE.InstancedBufferGeometry, value: number) {
        this.instanceCount = value
      },
    })
  }
}

/**
 * `WebGLRenderer#getSize()` used to create and return a Vector2 on its own;
 * newer revisions require the caller to pass a target. The legacy code calls it
 * with no argument and reads the result.
 *
 * three assigns `getSize` as an own property inside the constructor, so a
 * prototype override would be shadowed: the wrapper has to be installed per
 * instance, which this subclass does.
 */
export class LegacyWebGLRenderer extends THREE.WebGLRenderer {
  constructor(parameters?: THREE.WebGLRendererParameters) {
    super(parameters)

    const originalGetSize = this.getSize.bind(this)

    this.getSize = (target?: THREE.Vector2): THREE.Vector2 => {
      const result = target ?? new THREE.Vector2()
      originalGetSize(result)
      return result
    }
  }
}

/** Three.js exports exposed under their historical names on the global object. */
export const threeLegacyAliases = {
  PlaneBufferGeometry: THREE.PlaneGeometry,
}
