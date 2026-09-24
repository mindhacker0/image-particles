import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import Hammer from 'hammerjs'
import Clipboard from 'clipboard'
import 'material-design-lite'
import { TweenLite, legacyEases } from './gsapLegacy'
import { LegacyWebGLRenderer, applyThreePrototypeCompat, threeLegacyAliases } from './threeLegacyCompat'
import { Twix } from './twixLegacy'

/**
 * The legacy engine was written as classic scripts and reads its dependencies
 * from the global scope, exactly like the original `<script>` tags did.
 *
 * Everything below replaces a `third_party/js/*` file with an npm package:
 *
 *   three.min.js        -> three
 *   OrbitControls.js    -> three/examples/jsm/controls/OrbitControls.js
 *   TrackballControls.js-> three/examples/jsm/controls/TrackballControls.js
 *   TweenLite.min.js    -> gsap        (legacy TweenLite facade)
 *   CSSPlugin.min.js    -> gsap        (CSS animation is built into GSAP 3)
 *   EasePack.min.js     -> gsap        (all eases ship with GSAP 3)
 *   material.min.js     -> material-design-lite
 *   hammer.js           -> hammerjs
 *   clipboard.min.js    -> clipboard
 *   twix.min.js         -> local fetch based shim (no matching npm package)
 */

let installed = false

export function installLegacyGlobals(): void {
  if (installed) return
  installed = true

  applyThreePrototypeCompat()

  // `import * as THREE` returns a frozen ES module namespace, so the aliases
  // have to live on a plain object instead of being assigned onto the namespace.
  const three = {
    ...THREE,
    ...threeLegacyAliases,
    OrbitControls,
    TrackballControls,
    WebGLRenderer: LegacyWebGLRenderer,
  }

  const scope = window as unknown as Record<string, unknown>
  scope.THREE = three
  scope.Hammer = Hammer
  scope.Clipboard = Clipboard
  scope.TweenLite = TweenLite
  scope.Twix = Twix
  Object.assign(scope, legacyEases)
}

/** Globals provided for the legacy engine, for consumers that need them typed. */
export const legacyGlobals = {
  TweenLite,
  Twix,
  eases: legacyEases,
}
