import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import Hammer from 'hammerjs'
import Clipboard from 'clipboard'
import 'material-design-lite'
import { TweenLite, legacyEases } from './gsapLegacy'
import { applyThreePrototypeCompat, threeLegacyAliases } from './threeLegacyCompat'
import { Twix } from './twixLegacy'

/**
 * The legacy engine was written as classic scripts and reads its dependencies
 * from the global scope, exactly like the original `<script>` tags did.
 *
 * Everything below replaces a `third_party/js/*` file with an npm package:
 *
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
