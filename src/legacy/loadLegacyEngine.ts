import { bootFreefall } from '../engine/apps/AppFreefall'
import { seedMockItems } from '../engine/mock/mockItems'

/**
 * Boots the engine exactly once.
 *
 * The engine is a graph of TypeScript modules (`src/engine/**`, `src/ui/**`):
 * `bootFreefall()` starts the application (the old `setup` of the last script)
 * and the module import graph provides everything else.
 *
 * React's StrictMode mounts effects twice in development and the engine is not
 * re-entrant, so the work is memoized behind a single promise.
 */
let enginePromise: Promise<void> | undefined

async function startEngine(): Promise<void> {
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
