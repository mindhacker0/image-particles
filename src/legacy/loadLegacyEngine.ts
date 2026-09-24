import { bootFreefall } from '../engine/apps/AppFreefall'
import { installPortedModules } from '../engine/install'
import { seedMockItems } from '../engine/mock/mockItems'
import { installLegacyGlobals } from './globals'

/**
 * Boots the engine exactly once.
 *
 * The original page loaded a list of classic scripts in a significant order,
 * each relying on `var` declarations shared through the global scope. Every one
 * of them is a TypeScript module now (`src/engine/**`, `src/ui/**`) and
 * `installPortedModules()` publishes the globals they used to create, so
 * `legacyScriptOrder` is gone: the order is the import graph plus this sequence.
 *
 * The last statement of the last classic script (`js/apps/app_freefall.js`)
 * booted the application by calling the global `setup` of `js/main.js`; that call
 * is `bootFreefall()` and happens last, after every module is installed.
 *
 * React's StrictMode mounts effects twice in development and the engine is not
 * re-entrant, so the work is memoized behind a single promise.
 */
let enginePromise: Promise<void> | undefined

async function startEngine(): Promise<void> {
  // npm packages and ported modules replace the vendor files and every script of
  // the original `<script>` list.
  installLegacyGlobals()
  installPortedModules()

  // `Model.items` has to be populated before the application runs its date /
  // colour / rasterfairy passes.
  await seedMockItems()

  bootFreefall()
}

/** Loads the engine exactly once. */
export function loadLegacyEngine(): Promise<void> {
  enginePromise ??= startEngine()
  return enginePromise
}
